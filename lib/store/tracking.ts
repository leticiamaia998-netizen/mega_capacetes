import { STORE } from "./env";
import { sbSelect, sbUpsert, type OrderRow } from "./supabase";

export function gerarCodigoRastreio() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = STORE.trackingPrefix;
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function saveRastreioOrigem(order: Pick<OrderRow, "id" | "nome">, codigo: string) {
  await sbUpsert(
    "rastreio_origem",
    {
      codigo,
      nome_cliente: order.nome,
      order_id: order.id,
      origem_at: new Date().toISOString(),
    },
    "codigo",
  );
}

export function timelineFrom(origemAt: string) {
  const origin = new Date(origemAt).getTime();
  const add = (hours: number) => new Date(origin + hours * 3_600_000).toISOString();
  const now = Date.now();
  return [
    { etapa: "Pedido postado", descricao: "Seu pedido foi postado nos Correios", data: add(0), concluido: true },
    { etapa: "Em trânsito", descricao: "Objeto encaminhado para a unidade de distribuição", data: add(24), concluido: now > origin + 24 * 3_600_000 },
    { etapa: "Hub regional", descricao: "Chegou no centro de distribuição regional", data: add(72), concluido: now > origin + 72 * 3_600_000 },
    { etapa: "Saiu para entrega", descricao: "Objeto saiu para entrega ao destinatário", data: add(144), concluido: now > origin + 144 * 3_600_000 },
    { etapa: "Entregue", descricao: "Objeto entregue ao destinatário", data: add(168), concluido: now > origin + 168 * 3_600_000 },
  ];
}

export async function findRastreio(codigo: string) {
  const rows = await sbSelect<Record<string, unknown>>(
    "rastreio_origem",
    `codigo=eq.${encodeURIComponent(codigo.toUpperCase())}&select=*`,
  );
  return rows[0] ?? null;
}
