import { json, options } from "@/lib/store/http";
import { isPaidStatus, sbSelect, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) return json({ success: false, error: "orderId obrigatório" }, 400);
  const order = (await sbSelect<OrderRow>("orders", `id=eq.${orderId}&select=id,status,card_status,transaction_id,codigo_rastreio`))[0];
  if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);
  return json({
    success: true,
    status: order.status,
    paid: isPaidStatus(order.status),
    cardStatus: order.card_status,
    transactionId: order.transaction_id,
    codigoRastreio: order.codigo_rastreio,
  });
}
