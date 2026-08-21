import { STORE } from "./env";
import {
  formatTimelineWhen,
  reenvioTimelineFrom,
  timelineFrom,
  TAXA_REENVIO_VALOR,
  type RastreioResult,
  type TimelineItem,
} from "./tracking-ui";
import { sbSelect, sbUpsert, type OrderRow } from "./supabase";

export type { TimelineItem, RastreioResult };
export { TAXA_REENVIO_VALOR, timelineFrom, reenvioTimelineFrom, formatTimelineWhen };

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

export function statusFromTimeline(items: TimelineItem[]) {
  const lastDone = [...items].reverse().find((item) => item.concluido);
  return lastDone?.etapa || "Pedido confirmado";
}

export async function findRastreio(codigo: string) {
  const rows = await sbSelect<Record<string, unknown>>(
    "rastreio_origem",
    `codigo=eq.${encodeURIComponent(codigo.toUpperCase())}&select=*`,
  );
  return rows[0] ?? null;
}
