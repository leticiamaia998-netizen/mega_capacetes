import { json, options, readJson } from "@/lib/store/http";
import { findOrderByGatewayRef, markOrderPaid, webhookLooksPaid } from "@/lib/store/paid-flow";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!webhookLooksPaid(body)) {
      return json({ received: true, action: "ignored", status: body.status || body.payment_status });
    }

    const order = await findOrderByGatewayRef(body);
    if (!order) return json({ error: "Pedido não encontrado" }, 404);

    const result = await markOrderPaid(order.id, {
      transaction_id: String(body.id || body.charge_id || body.transaction_id || order.transaction_id || ""),
    });

    return json({
      received: true,
      action: result.alreadyPaid ? "already_paid" : "paid",
      orderId: order.id,
      codigo: result.codigo,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
}
