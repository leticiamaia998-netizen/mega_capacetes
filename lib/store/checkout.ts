import { activePixGateway, credentialsFor, gatewayCode } from "./gateways";
import { notifyAdmin } from "./emails";
import { createPixCharge } from "./pix";
import { isPaidStatus, sbInsert, sbSelect, sbUpdate, type OrderRow } from "./supabase";

export type CheckoutCustomer = {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
};

export type CheckoutAddress = {
  cep?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export type CheckoutPayload = {
  amount?: number;
  customer?: CheckoutCustomer;
  items?: Array<{ name?: string; quantity?: number; price?: number }>;
  shippingAddress?: CheckoutAddress;
  shippingAddressFull?: CheckoutAddress;
  utm?: Record<string, unknown>;
  tracking?: Record<string, unknown>;
  subtotal?: number;
  totalDiscount?: number;
  shippingCost?: number;
  shippingMethod?: string;
  ga_client_id?: string;
  orderId?: string;
  fallbackFromCard?: boolean;
};

function mergedAddress(payload: CheckoutPayload): CheckoutAddress {
  return { ...(payload.shippingAddress || {}), ...(payload.shippingAddressFull || {}) };
}

function orderInsertFromPayload(payload: CheckoutPayload, method: "pix" | "card", gatewayId: string, gatewayName: string) {
  const customer = payload.customer || {};
  const address = mergedAddress(payload);
  const amount = Number(payload.amount || 0);
  return {
    nome: customer.name,
    email: customer.email,
    telefone: customer.phone,
    cpf: customer.cpf,
    valor: amount,
    produtos: payload.items,
    subtotal: payload.subtotal ?? amount,
    desconto: payload.totalDiscount ?? 0,
    frete: payload.shippingCost ?? 0,
    metodo_envio: payload.shippingMethod ?? "free",
    cep: address.cep,
    rua: address.address,
    numero: address.number,
    complemento: address.complement,
    bairro: address.neighborhood,
    cidade: address.city,
    estado: address.state,
    metodo_pagamento: method,
    status: "pending",
    status_detalhe: method === "pix" ? "checkout_iniciado" : "cartao_iniciado",
    utm: payload.utm ?? {},
    tracking: payload.tracking ?? {},
    ga_client_id: payload.ga_client_id,
    customer: {
      full_name: customer.name,
      email: customer.email,
      phone: customer.phone ?? "",
      cpf: customer.cpf ?? "",
    },
    gateway: { gateway_type: method, name: gatewayName, id: gatewayId },
    gateway_id: gatewayId,
    recovery_next_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    recovery_count: 0,
  };
}

export async function createOrReusePixOrder(payload: CheckoutPayload) {
  const customer = payload.customer || {};
  const amount = Number(payload.amount || 0);
  if (!amount || !customer.name || !customer.email) {
    throw new Error("Dados incompletos");
  }

  const gateway = await activePixGateway();
  if (!gateway) throw new Error("Nenhum gateway PIX ativo");
  const code = gatewayCode(gateway);
  if (!credentialsFor(code)) throw new Error(`Gateway ${code} sem credencial configurada`);

  if (payload.orderId) {
    const existing = await sbSelect<OrderRow>("orders", `id=eq.${payload.orderId}&select=*`);
    if (existing[0]) {
      if (isPaidStatus(existing[0].status)) {
        return { order: existing[0], gateway, alreadyPaid: true as const };
      }
      return { order: existing[0], gateway, reused: true as const };
    }
  }

  const nowIso = encodeURIComponent(new Date().toISOString());
  const reused = await sbSelect<OrderRow>(
    "orders",
    `email=eq.${encodeURIComponent(String(customer.email))}&valor=eq.${amount}&status=eq.pending&pix_expires_at=gt.${nowIso}&order=created_at.desc&limit=1&select=*`,
  );
  if (reused[0]?.pix_copy_paste || reused[0]?.pix_qr_code) {
    return { order: reused[0], gateway, reused: true as const };
  }

  const order = await sbInsert<OrderRow>(
    "orders",
    orderInsertFromPayload(payload, "pix", code, gateway.name || gateway.nome || code),
  );

  await notifyAdmin("novo_pedido", "Novo pedido PIX", `${customer.name} - R$ ${amount.toFixed(2)}`, order.id).catch(
    () => null,
  );

  return { order, gateway, reused: false as const };
}

export async function generatePixForOrder(order: OrderRow, payload: CheckoutPayload, code: string) {
  if (isPaidStatus(order.status)) {
    return { alreadyPaid: true, qrCode: "", copyPaste: "", externalId: order.transaction_id || order.id, order };
  }
  if (order.pix_copy_paste || order.pix_qr_code) {
    return {
      alreadyPaid: false,
      qrCode: order.pix_qr_code || "",
      copyPaste: order.pix_copy_paste || "",
      externalId: order.external_id || order.transaction_id || order.id,
      order,
    };
  }

  try {
    const charged = await createPixCharge(code, {
      amount: Number(order.valor || payload.amount || 0),
      orderId: order.id,
      customer: {
        name: String(payload.customer?.name || order.nome || ""),
        email: String(payload.customer?.email || order.email || ""),
        cpf: payload.customer?.cpf || order.cpf || "",
        phone: payload.customer?.phone || order.telefone || "",
      },
      items: payload.items || (Array.isArray(order.produtos) ? order.produtos : undefined),
    });

    await sbUpdate("orders", `id=eq.${order.id}`, {
      status: "pending",
      status_detalhe: "pix_gerado",
      transaction_id: charged.externalId,
      external_id: charged.externalId,
      pix_qr_code: charged.qrCode,
      pix_copy_paste: charged.copyPaste,
      pix_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      pix_error: null,
      gateway: {
        gateway_type: "pix",
        name: code,
        id: code,
        response: charged.raw,
      },
      gateway_id: code,
    });

    if (!charged.copyPaste && !charged.qrCode) {
      await sbInsert("pix_errors", {
        order_id: order.id,
        error_message: "Resposta PIX sem código reconhecido",
        error_details: charged.raw,
      }).catch(() => null);
      throw new Error("Resposta PIX sem código reconhecido");
    }

    return {
      alreadyPaid: false,
      qrCode: charged.qrCode,
      copyPaste: charged.copyPaste,
      externalId: charged.externalId,
      order,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar PIX";
    await sbUpdate("orders", `id=eq.${order.id}`, { pix_error: message }).catch(() => null);
    await sbInsert("pix_errors", {
      order_id: order.id,
      error_message: message,
      error_details: { error: message },
    }).catch(() => null);
    throw error;
  }
}

export async function createCardOrder(payload: CheckoutPayload) {
  const customer = payload.customer || {};
  const amount = Number(payload.amount || 0);
  if (!amount || !customer.name || !customer.email) throw new Error("Dados incompletos");
  return sbInsert<OrderRow>(
    "orders",
    orderInsertFromPayload(payload, "card", "venuspay", "Venus Pay"),
  );
}
