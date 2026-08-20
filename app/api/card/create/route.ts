import { chargeVenusCard } from "@/lib/store/card";
import { createCardOrder, type CheckoutPayload } from "@/lib/store/checkout";
import { cardGatewayEnabled } from "@/lib/store/gateways";
import { json, options, readJson } from "@/lib/store/http";
import { markOrderPaid } from "@/lib/store/paid-flow";
import { isPaidStatus, sbSelect, sbUpdate, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

type CardBody = CheckoutPayload & {
  card?: {
    number?: string;
    cvv?: string;
    expiryMonth?: string;
    expiryYear?: string;
    holderName?: string;
  };
  installments?: number;
};

export async function POST(request: Request) {
  try {
    if (!(await cardGatewayEnabled())) {
      return json({ configured: false, error: "Cartão indisponível no momento" }, 503);
    }

    const body = await readJson<CardBody>(request);
    let order: OrderRow | undefined;

    if (body.orderId) {
      order = (await sbSelect<OrderRow>("orders", `id=eq.${body.orderId}&select=*`))[0];
    }
    if (!order) {
      order = await createCardOrder(body);
    }
    if (isPaidStatus(order.status)) {
      return json({ error: "Pedido já pago" }, 409);
    }

    await sbUpdate("orders", `id=eq.${order.id}`, {
      status: "cartao_processando",
      metodo_pagamento: "card",
      gateway_id: "venuspay",
      gateway: { gateway_type: "card", name: "Venus Pay", id: "venuspay" },
    });

    const charged = await chargeVenusCard({
      order,
      card: {
        number: String(body.card?.number || ""),
        cvv: String(body.card?.cvv || ""),
        expiryMonth: String(body.card?.expiryMonth || ""),
        expiryYear: String(body.card?.expiryYear || ""),
        holderName: body.card?.holderName,
      },
      installments: body.installments,
    });

    if ("configured" in charged && charged.configured === false) {
      return json({ configured: false, error: charged.error }, 503);
    }
    if (charged.error && !charged.approved) {
      await sbUpdate("orders", `id=eq.${order.id}`, {
        status: "cartao_recusado",
        card_erro: charged.error,
        card_brand: charged.brand,
        card_last4: charged.last4,
        card_holder: charged.holder,
        card_installments: charged.installments,
        card_status: "declined",
        card_encriptado: charged.encrypted,
      });
      return json({
        success: false,
        status: "declined",
        orderId: order.id,
        error: charged.error,
        redirect: `/sucesso?payment=card&status=declined&orderId=${order.id}`,
      });
    }

    const paid = await markOrderPaid(order.id, {
      metodo_pagamento: "card",
      transaction_id: charged.transactionId,
      card_brand: charged.brand,
      card_last4: charged.last4,
      card_holder: charged.holder,
      card_installments: charged.installments,
      card_status: "approved",
      card_encriptado: charged.encrypted,
      card_erro: null,
    });

    return json({
      success: true,
      status: "approved",
      orderId: order.id,
      transactionId: charged.transactionId,
      codigoRastreio: paid.codigo,
      redirect: `/sucesso?payment=card&status=approved&orderId=${order.id}`,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro ao processar cartão" }, 500);
  }
}
