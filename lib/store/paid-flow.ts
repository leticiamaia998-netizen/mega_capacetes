import { notifyAdmin, sendFbPurchase, sendTrackingEmail, sendUtmify } from "./emails";
import { isPaidStatus, sbSelect, sbUpdate, type OrderRow } from "./supabase";
import { gerarCodigoRastreio, saveRastreioOrigem } from "./tracking";

export async function markOrderPaid(orderId: string, extra: Record<string, unknown> = {}) {
  const rows = await sbSelect<OrderRow>("orders", `id=eq.${orderId}&select=*`);
  const order = rows[0];
  if (!order) throw new Error("Pedido não encontrado");

  if (isPaidStatus(order.status) && order.codigo_rastreio) {
    return { order, codigo: order.codigo_rastreio, alreadyPaid: true };
  }

  const codigo = order.codigo_rastreio || gerarCodigoRastreio();
  // SELECT id → UPDATE por id (regra 4.5)
  await sbUpdate("orders", `id=eq.${order.id}`, {
    status: "paid",
    status_detalhe: "pago",
    paid_at: new Date().toISOString(),
    codigo_rastreio: codigo,
    purchase_sent: true,
    ...extra,
  });

  await saveRastreioOrigem(order, codigo);

  if (order.email) {
    await sendTrackingEmail({
      email: order.email,
      nomeCliente: order.nome,
      codigoRastreio: codigo,
    }).catch((error) => console.error("email rastreio", error));
  }

  if (!order.purchase_sent) {
    await sendFbPurchase({ ...order, id: order.id }).catch((error) => console.error("fb purchase", error));
  }
  await sendUtmify({ ...order, id: order.id }).catch((error) => console.error("utmify", error));
  await notifyAdmin(
    "pagamento_confirmado",
    "Pagamento confirmado",
    `${order.nome} - R$ ${Number(order.valor || 0).toFixed(2)}`,
    order.id,
  );

  return { order, codigo, alreadyPaid: false };
}

export async function findOrderByGatewayRef(body: Record<string, unknown>) {
  const candidates = [
    body.external_id,
    body.order_id,
    (body.metadata as Record<string, unknown> | undefined)?.order_id,
    body.id,
    body.charge_id,
    body.transaction_id,
    body.hash,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const value of candidates) {
    const byId = await sbSelect<OrderRow>("orders", `id=eq.${value}&select=*`);
    if (byId[0]) return byId[0];
    const byTx = await sbSelect<OrderRow>("orders", `transaction_id=eq.${value}&select=*`);
    if (byTx[0]) return byTx[0];
    const byExt = await sbSelect<OrderRow>("orders", `external_id=eq.${value}&select=*`);
    if (byExt[0]) return byExt[0];
  }
  return null;
}

export function webhookLooksPaid(body: Record<string, unknown>) {
  const status = String(body.status || body.payment_status || body.paymentStatus || "").toLowerCase();
  return ["paid", "approved", "completed", "pago", "aprovado", "authorized"].includes(status);
}
