import { sendUtmify } from "@/lib/store/emails";
import { json, options, readJson } from "@/lib/store/http";
import { sbSelect, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string }>(request);
    if (!body.orderId) return json({ success: false, error: "orderId obrigatório" }, 400);
    const order = (await sbSelect<OrderRow>("orders", `id=eq.${body.orderId}&select=*`))[0];
    if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);
    const result = await sendUtmify(order);
    return json({ success: true, result });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro UTMify" }, 500);
  }
}
