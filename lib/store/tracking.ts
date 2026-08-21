import { STORE } from "./env";
import { sbSelect, sbUpsert, type OrderRow } from "./supabase";

export type TimelineItem = {
  etapa: string;
  descricao: string;
  data: string;
  concluido: boolean;
};

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

function hubPorEstado(uf: string) {
  const mapa: Record<string, string> = {
    SP: "São Paulo, SP",
    RJ: "Campinas, SP",
    ES: "Campinas, SP",
    MG: "Belo Horizonte, MG",
    RS: "Curitiba, PR",
    SC: "Curitiba, PR",
    PR: "Curitiba, PR",
    GO: "Goiânia, GO",
    DF: "Goiânia, GO",
    MT: "Goiânia, GO",
    MS: "Goiânia, GO",
    TO: "Goiânia, GO",
    BA: "Salvador, BA",
    SE: "Salvador, BA",
    PE: "Recife, PE",
    PB: "Recife, PE",
    AL: "Recife, PE",
    RN: "Natal, RN",
    CE: "Fortaleza, CE",
    PI: "Fortaleza, CE",
    MA: "Fortaleza, CE",
    PA: "Belém, PA",
    AP: "Belém, PA",
    AM: "Manaus, AM",
    RR: "Manaus, AM",
    AC: "Manaus, AM",
    RO: "Manaus, AM",
  };
  return mapa[uf.toUpperCase()] || "São Paulo, SP";
}

export function timelineFrom(
  origemAt: string,
  dest?: { cidade?: string | null; estado?: string | null },
): TimelineItem[] {
  const origin = new Date(origemAt).getTime();
  const now = Date.now();
  const at = (hours: number) => new Date(origin + hours * 3_600_000);
  const cidade = dest?.cidade || "";
  const estado = dest?.estado || "";
  const destino = cidade && estado ? `${cidade}, ${estado}` : cidade || estado;
  const hub = estado ? hubPorEstado(estado) : "São Paulo, SP";

  const steps: Array<{ etapa: string; descricao: string; hours: number; force?: boolean }> = [
    {
      etapa: "Pedido confirmado",
      descricao: "Pagamento recebido. Seu pedido foi registrado com sucesso.",
      hours: 0,
      force: true,
    },
    {
      etapa: "Pedido postado",
      descricao: "Seu pedido foi postado e encaminhado para a transportadora.",
      hours: 2,
    },
    {
      etapa: "Em trânsito",
      descricao: `Objeto em trânsito — centro de origem → ${hub}.`,
      hours: 24,
    },
    {
      etapa: "Hub regional",
      descricao: `Chegou no centro de distribuição regional — ${hub}.`,
      hours: 72,
    },
    {
      etapa: "Saiu para entrega",
      descricao: destino
        ? `Objeto saiu para entrega em ${destino}.`
        : "Objeto saiu para entrega ao destinatário.",
      hours: 144,
    },
    {
      etapa: "Entregue",
      descricao: destino ? `Pedido entregue em ${destino}.` : "Objeto entregue ao destinatário.",
      hours: 168,
    },
  ];

  return steps.map((step) => {
    const data = at(step.hours);
    return {
      etapa: step.etapa,
      descricao: step.descricao,
      data: data.toISOString(),
      concluido: Boolean(step.force) || now >= data.getTime(),
    };
  });
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
