import { json, options } from "@/lib/store/http";
import { isPaidStatus, sbSelect, type OrderRow } from "@/lib/store/supabase";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
  if (!orderId) return json({ success: false, error: "orderId obrigatório" }, 400);

  const rows = await sbSelect<OrderRow>(
    "orders",
    `id=eq.${orderId}&select=id,status,valor,nome,email,produtos,pix_qr_code,pix_copy_paste,transaction_id,codigo_rastreio,gateway_id,cidade,estado`,
  );
  const order = rows[0];
  if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);

  return json({
    success: true,
    orderId: order.id,
    status: order.status,
    paid: isPaidStatus(order.status),
    qrCode: order.pix_qr_code,
    copyPaste: order.pix_copy_paste,
    transactionId: order.transaction_id,
    codigoRastreio: order.codigo_rastreio,
    amount: Number(order.valor || 0),
    customerName: order.nome || "",
    email: order.email || "",
    items: Array.isArray(order.produtos) ? order.produtos : [],
    gateway: order.gateway_id || "",
    city: order.cidade || "",
    state: order.estado || "",
  });
}
