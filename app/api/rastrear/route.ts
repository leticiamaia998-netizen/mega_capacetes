import { json, options } from "@/lib/store/http";
import { findRastreio, timelineFrom } from "@/lib/store/tracking";
import { sbSelect, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const codigo = new URL(request.url).searchParams.get("codigo") || new URL(request.url).searchParams.get("code");
  if (!codigo) return json({ success: false, error: "Código de rastreio obrigatório" }, 400);

  const origem = await findRastreio(codigo);
  if (!origem) return json({ success: false, error: "Código de rastreio não encontrado" }, 404);

  let endereco: Partial<OrderRow> | null = null;
  if (origem.order_id) {
    endereco = (await sbSelect<OrderRow>(
      "orders",
      `id=eq.${origem.order_id}&select=cidade,estado,cep,rua,numero,complemento,bairro,nome,email,telefone`,
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
