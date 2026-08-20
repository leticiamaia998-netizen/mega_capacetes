import { sendRecoveryEmail } from "@/lib/store/emails";
import { json, options, readJson } from "@/lib/store/http";
import { isPaidStatus, sbInsert, sbSelect, type OrderRow } from "@/lib/store/supabase";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action || "");

    if (action === "save-abandoned") {
      const email = String(body.email || "");
      if (!email) return json({ success: false, error: "Email obrigatório" }, 400);
      const since = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const existing = await sbSelect<OrderRow>(
        "orders",
        `email=eq.${encodeURIComponent(email)}&created_at=gte.${since}&order=created_at.desc&limit=1&select=id,status,created_at`,
      );
      if (existing[0] && isPaidStatus(existing[0].status)) {
        return json({ success: true, action: "skipped" });
      }
      const order = await sbInsert<OrderRow>("orders", {
        email,
        nome: body.nome,
        produtos: body.produtos,
        valor: body.valor,
        utm: body.utm,
        status: "abandonou",
        metodo_pagamento: "pix",
        recovery_count: 0,
        recovery_next_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      return json({ success: true, orderId: order.id });
    }

    if (action === "send-recovery") {
      const order = (await sbSelect<OrderRow>("orders", `id=eq.${body.orderId}&select=id,nome,email,valor`))[0];
      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      const ok = await sendRecoveryEmail(order);
      return json({ success: ok });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
}
