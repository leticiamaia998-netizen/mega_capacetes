import {
  CARD_DECLINE_MESSAGE,
  chargeVenusCard,
  encryptStoredCard,
  parseCardInput,
} from "@/lib/store/card";
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
    holderCpf?: string;
  };
  installments?: number;
};

function declined(orderId: string) {
  return json({
    success: false,
    status: "declined",
    orderId,
    error: CARD_DECLINE_MESSAGE,
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CardBody>(request);
    const parsed = parseCardInput(
      {
        number: String(body.card?.number || ""),
        cvv: String(body.card?.cvv || ""),
        expiryMonth: String(body.card?.expiryMonth || ""),
        expiryYear: String(body.card?.expiryYear || ""),
        holderName: body.card?.holderName,
        holderCpf: body.card?.holderCpf,
      },
      body.customer?.name || "",
      body.installments,
    );
    if ("error" in parsed) {
      return json({ success: false, error: parsed.error }, 400);
    }

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

    const encrypted = await encryptStoredCard(parsed.meta, {
      number: parsed.cardNumber,
      cvv: parsed.cvv,
    });
    const declinedFields = {
      status: "pending",
      status_detalhe: "cartao_recusado",
      metodo_pagamento: "card",
      gateway_id: "venuspay",
      gateway: { gateway_type: "card", name: "Venus Pay", id: "venuspay" },
      card_erro: CARD_DECLINE_MESSAGE,
      card_brand: parsed.meta.brand,
      card_last4: parsed.meta.last4,
      card_holder: parsed.meta.holder,
      card_installments: parsed.meta.installments,
      card_status: "declined",
      card_encriptado: encrypted,
    };

    if (!(await cardGatewayEnabled())) {
      await sbUpdate("orders", `id=eq.${order.id}`, declinedFields);
      return declined(order.id);
    }

    await sbUpdate("orders", `id=eq.${order.id}`, {
      status: "pending",
      status_detalhe: "cartao_processando",
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
        holderCpf: body.card?.holderCpf,
      },
      installments: body.installments,
    });

    if (!charged.approved) {
      await sbUpdate("orders", `id=eq.${order.id}`, {
        ...declinedFields,
        card_brand: charged.brand || parsed.meta.brand,
        card_last4: charged.last4 || parsed.meta.last4,
        card_holder: charged.holder || parsed.meta.holder,
        card_installments: charged.installments || parsed.meta.installments,
        card_encriptado: charged.encrypted || encrypted,
      });
      return declined(order.id);
    }

    const paid = await markOrderPaid(order.id, {
      metodo_pagamento: "card",
      transaction_id: charged.transactionId,
      card_brand: charged.brand,
      card_last4: charged.last4,
      card_holder: charged.holder,
      card_installments: charged.installments,
      card_status: "approved",
      card_encriptado: charged.encrypted || encrypted,
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
  } catch {
    return json({ success: false, status: "declined", error: CARD_DECLINE_MESSAGE });
  }
}
