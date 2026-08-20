import { json, options, readJson } from "@/lib/store/http";
import { findRastreio, timelineFrom } from "@/lib/store/tracking";
import { isPaidStatus, sbSelect, type OrderRow } from "@/lib/store/supabase";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ action?: string; codigo?: string; orderId?: string }>(request);

    if (body.action === "rastrear") {
      if (!body.codigo) return json({ success: false, error: "Código de rastreio obrigatório" }, 400);
      const origem = await findRastreio(body.codigo);
      if (!origem) return json({ success: false, error: "Código de rastreio não encontrado" }, 404);
      let endereco = null;
      if (origem.order_id) {
        endereco = (await sbSelect<OrderRow>(
          "orders",
          `id=eq.${origem.order_id}&select=cidade,estado,cep,rua,numero,complemento,bairro,nome`,
        ))[0] || null;
      }
      return json({
        success: true,
        codigo: origem.codigo,
        nome_cliente: origem.nome_cliente || endereco?.nome,
        origem_at: origem.origem_at,
        endereco,
        timeline: timelineFrom(String(origem.origem_at || new Date().toISOString())),
      });
    }

    if (body.action === "get-status") {
      const row = (await sbSelect<OrderRow>("orders_status", `id=eq.${body.orderId}&select=id,status,updated_at`))[0];
      if (!row) return json({ success: false, error: "Pedido não encontrado" }, 404);
      return json({ success: true, ...row, paid: isPaidStatus(row.status) });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
}
