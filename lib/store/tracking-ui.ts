export const TAXA_REENVIO_VALOR = 9;

export type TimelineItem = {
  etapa: string;
  descricao: string;
  data: string;
  concluido: boolean;
  erro?: boolean;
  taxa?: boolean;
};

function fmtDone(d: Date) {
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " — " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtPrev(d: Date) {
  return `Previsão: ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

export function formatTimelineWhen(iso: string, concluido: boolean) {
  const date = new Date(iso);
  if (concluido) return fmtDone(date);
  return fmtPrev(date);
}

export type RastreioResult = {
  timeline: TimelineItem[];
  status: string;
  previsao: string;
  falhaEntrega: boolean;
  aguardandoTaxa: boolean;
};

/** Horas após origem_at — alinhado ao guia (fluxo ~11 dias até taxa). */
const H = {
  SEPARACAO: 2 + 21 / 60,
  EMBALAGEM: 27 + 15 / 60,
  ENVIADO: 53 + 27 / 60,
  TRANSITO1: 101 + 14 / 60,
  TRANSITO2: 148 + 39 / 60,
  SAIU: 171 + 22 / 60,
  FALHA1: 195 + 22 / 60,
  TENTATIVA: 195 + 57 / 60,
  FALHA2: 198 + 42 / 60,
  RETORNANDO: 218 + 20 / 60,
  CD: 242 + 34 / 60,
  AGUARDANDO: 262 + 43 / 60,
  TAXA: 262 + 53 / 60,
} as const;

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

function addH(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 3_600_000);
}

export function timelineFrom(
  origemAt: string,
  dest?: { cidade?: string | null; estado?: string | null },
): RastreioResult {
  const origem = new Date(origemAt);
  const agora = Date.now();
  const h = (agora - origem.getTime()) / 3_600_000;

  const cidade = dest?.cidade || "";
  const estado = dest?.estado || "";
  const destino = cidade && estado ? `${cidade}, ${estado}` : cidade || estado;
  const hub = estado ? hubPorEstado(estado) : "São Paulo, SP";
  const cd = "Guarulhos, SP";

  const t = {
    separacao: addH(origem, H.SEPARACAO),
    embalagem: addH(origem, H.EMBALAGEM),
    enviado: addH(origem, H.ENVIADO),
    transito1: addH(origem, H.TRANSITO1),
    transito2: addH(origem, H.TRANSITO2),
    saiu: addH(origem, H.SAIU),
    falha1: addH(origem, H.FALHA1),
    tentativa: addH(origem, H.TENTATIVA),
    falha2: addH(origem, H.FALHA2),
    retornando: addH(origem, H.RETORNANDO),
    cd: addH(origem, H.CD),
    aguardando: addH(origem, H.AGUARDANDO),
    taxa: addH(origem, H.TAXA),
  };

  const previsaoOriginal = addH(origem, 9 * 24);
  const previsao = previsaoOriginal.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const timeline: TimelineItem[] = [
    {
      etapa: "Pedido confirmado",
      descricao: "Pagamento recebido. Seu pedido foi registrado com sucesso.",
      data: addH(origem, 0).toISOString(),
      concluido: true,
    },
    {
      etapa: "Em separação",
      descricao: `Produto em separação no estoque — ${cd}.`,
      data: t.separacao.toISOString(),
      concluido: h >= H.SEPARACAO,
    },
    {
      etapa: "Em embalagem",
      descricao: "Seu pedido está sendo embalado com cuidado para garantir que chegue em perfeito estado.",
      data: t.embalagem.toISOString(),
      concluido: h >= H.EMBALAGEM,
    },
    {
      etapa: "Coletado pela transportadora",
      descricao: `Pedido coletado e despachado — partindo de ${cd}.`,
      data: t.enviado.toISOString(),
      concluido: h >= H.ENVIADO,
    },
    {
      etapa: "Em trânsito",
      descricao:
        hub && hub !== "São Paulo, SP"
          ? `Objeto em trânsito — ${cd} → ${hub}.`
          : "Objeto em trânsito — Centro de Triagem Nacional.",
      data: t.transito1.toISOString(),
      concluido: h >= H.TRANSITO1,
    },
    {
      etapa: "Em trânsito",
      descricao: destino
        ? `Objeto em rota para entrega — ${hub} → ${destino}.`
        : "Objeto em rota para a unidade de distribuição de destino.",
      data: t.transito2.toISOString(),
      concluido: h >= H.TRANSITO2,
    },
    {
      etapa: "Saiu para entrega",
      descricao: destino
        ? `O pedido está com o entregador em ${destino} e será entregue em breve.`
        : "O pedido está com o entregador e será entregue em breve.",
      data: t.saiu.toISOString(),
      concluido: h >= H.SAIU,
    },
  ];

  if (h >= H.FALHA1) {
    timeline.push({
      etapa: "Falha na tentativa de entrega",
      descricao: destino
        ? `A transportadora tentou realizar a entrega em ${destino}, mas não localizou nenhum responsável no endereço.`
        : "A transportadora tentou realizar a entrega, mas não localizou nenhum responsável no endereço.",
      data: t.falha1.toISOString(),
      concluido: false,
      erro: true,
    });
  }

  if (h >= H.TENTATIVA) {
    timeline.push({
      etapa: "Em trânsito — tentativa de entrega",
      descricao: destino
        ? `A transportadora está realizando uma nova tentativa de entrega em ${destino}.`
        : "A transportadora está realizando uma nova tentativa de entrega no endereço cadastrado.",
      data: t.tentativa.toISOString(),
      concluido: true,
    });
  }

  if (h >= H.FALHA2) {
    timeline.push({
      etapa: "Falha na tentativa de entrega",
      descricao: destino
        ? `A transportadora realizou nova tentativa em ${destino}, mas não localizou nenhum responsável. O objeto está retornando ao Centro de Distribuição.`
        : "A transportadora realizou nova tentativa, mas não localizou nenhum responsável. O objeto está retornando ao Centro de Distribuição.",
      data: t.falha2.toISOString(),
      concluido: false,
      erro: true,
    });
  }

  if (h >= H.RETORNANDO) {
    timeline.push({
      etapa: "Em trânsito — retornando ao CD",
      descricao: `O objeto está a caminho do Centro de Distribuição — ${cd}.`,
      data: t.retornando.toISOString(),
      concluido: true,
    });
  }

  if (h >= H.CD) {
    timeline.push({
      etapa: "Chegou ao Centro de Distribuição",
      descricao: `Objeto recebido no CD — ${cd}. Aguardando instrução do destinatário.`,
      data: t.cd.toISOString(),
      concluido: true,
    });
  }

  if (h >= H.AGUARDANDO) {
    timeline.push({
      etapa: "Aguardando instrução do destinatário",
      descricao:
        "O objeto permanece retido no Centro de Distribuição. É necessária uma ação do destinatário para liberar o reenvio.",
      data: t.aguardando.toISOString(),
      concluido: false,
    });
  }

  if (h >= H.TAXA) {
    timeline.push({
      etapa: "Aguardando taxa de reenvio",
      descricao:
        "Para que seu pedido seja reenviado, é necessário o pagamento da taxa de reenvio. Após a confirmação, entrega em até 2 dias úteis.",
      data: t.taxa.toISOString(),
      concluido: false,
      taxa: true,
    });
  }

  let status: string;
  if (h >= H.TAXA) status = "Taxa de reenvio";
  else if (h >= H.AGUARDANDO) status = "Aguardando instrução";
  else if (h >= H.CD) status = "No Centro de Distribuição";
  else if (h >= H.RETORNANDO) status = "Retornando ao CD";
  else if (h >= H.FALHA2) status = "Falha na entrega";
  else if (h >= H.TENTATIVA) status = "Em trânsito";
  else if (h >= H.FALHA1) status = "Falha na entrega";
  else if (h >= H.SAIU) status = "Saiu para entrega";
  else if (h >= H.TRANSITO2) status = "Em trânsito";
  else if (h >= H.TRANSITO1) status = "Em trânsito";
  else if (h >= H.ENVIADO) status = "Enviado";
  else if (h >= H.EMBALAGEM) status = "Em embalagem";
  else if (h >= H.SEPARACAO) status = "Em separação";
  else status = "Pedido confirmado";

  return {
    timeline,
    status,
    previsao,
    falhaEntrega: h >= H.FALHA1,
    aguardandoTaxa: h >= H.TAXA,
  };
}

export function reenvioTimelineFrom(pagoEm: string, nomeCliente?: string): TimelineItem[] {
  const pago = new Date(pagoEm);
  const agora = Date.now();
  const min = (agora - pago.getTime()) / 60_000;
  const primeiroNome = nomeCliente
    ? nomeCliente.split(" ")[0].charAt(0).toUpperCase() + nomeCliente.split(" ")[0].slice(1).toLowerCase()
    : "";

  const tSep = new Date(pago.getTime() + 2 * 3_600_000);
  const tSaiu = new Date(pago.getTime() + 24 * 3_600_000);
  const tEntregue = new Date(pago.getTime() + 48 * 3_600_000);

  return [
    {
      etapa: "Taxa de reenvio confirmada",
      descricao: "Pagamento recebido. Reenvio aprovado com prioridade.",
      data: pago.toISOString(),
      concluido: true,
    },
    {
      etapa: "Em separação para reenvio",
      descricao: "Seu pedido está sendo separado e embalado para novo despacho — Guarulhos, SP.",
      data: tSep.toISOString(),
      concluido: min >= 120,
    },
    {
      etapa: "Saiu para entrega",
      descricao: "Pedido despachado! O entregador está a caminho do seu endereço.",
      data: tSaiu.toISOString(),
      concluido: min >= 1440,
    },
    {
      etapa: primeiroNome ? `Entregue a ${primeiroNome}` : "Entregue",
      descricao: "Seu pedido foi entregue com sucesso. Obrigado pela confiança!",
      data: tEntregue.toISOString(),
      concluido: min >= 2880,
    },
  ];
}
