const ACTIONS_ID = "admin-tracking-actions";

const STATUS_LABELS = {
  checkout_iniciado: "Checkout iniciado",
  cartao_iniciado: "Cartão iniciado",
  cartao_processando: "Cartão processando",
  cartao_recusado: "Cartão recusado",
  pix_gerado: "PIX gerado",
  abandonou: "Carrinho abandonado",
  pending: "Aguardando pagamento",
  pago: "Pago",
  paid: "Pago",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isAdminArea() {
  return /^\/(xxx|admin)(\/|$)/.test(window.location.pathname);
}

function getAccessToken() {
  try {
    const hmac = localStorage.getItem("mcAdminToken");
    if (hmac) return hmac;
  } catch {
    /* ignore */
  }
  for (const key of Object.keys(localStorage)) {
    if (!key.includes("auth-token")) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      const token =
        value?.access_token || value?.currentSession?.access_token || value?.session?.access_token || null;
      if (token) return token;
    } catch {
      /* ignora chave inválida */
    }
  }
  return null;
}

async function invokeAdmin(action, payload = {}) {
  const token = getAccessToken();
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Operação não concluída");
  }
  return data;
}

function findOrderDialog() {
  return [...document.querySelectorAll('[role="dialog"]')].find((dialog) =>
    dialog.textContent?.includes("Detalhes do Pedido"),
  );
}

function getOrderId(dialog) {
  const match = dialog.textContent?.match(/ID do Pedido:\s*([0-9a-f-]{8,})/i);
  return match?.[1]?.trim() || null;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function whatsappLink(order, codigo) {
  const phone = digits(order.telefone || order.customer?.phone || "");
  const withCountry = phone.startsWith("55") ? phone : phone ? `55${phone}` : "";
  const nome = String(order.nome || order.customer?.full_name || "cliente").split(" ")[0];
  const url = `${window.location.origin}/rastrear-pedido?codigo=${encodeURIComponent(codigo)}`;
  const text = `Olá ${nome}, seu pedido na MegaCapacetes foi enviado.\n\nCódigo de rastreio: ${codigo}\nAcompanhe em: ${url}`;
  return withCountry
    ? `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function createButton(label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  return button;
}

function sectionTitle(text) {
  const title = document.createElement("h3");
  title.className = "text-sm font-semibold text-zinc-400 uppercase tracking-wide";
  title.textContent = text;
  return title;
}

function trackingSection(orderId, order, container) {
  const box = document.createElement("div");
  box.className = "bg-zinc-800/50 rounded-lg p-4 space-y-3";

  const codeLine = document.createElement("p");
  codeLine.className = "font-mono text-lg font-bold text-emerald-400 tracking-widest";
  codeLine.textContent = order.codigo_rastreio || "—";

  const status = document.createElement("p");
  status.className = "text-sm text-zinc-400";
  status.textContent = order.codigo_rastreio
    ? "Código salvo neste pedido."
    : "Gere o código e envie por WhatsApp ou e-mail.";

  const generate = createButton(
    order.codigo_rastreio ? "Regenerar código" : "Gerar código",
    "rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50",
  );
  const copy = createButton(
    "Copiar",
    "rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700",
  );
  const whatsapp = createButton(
    "WhatsApp",
    "rounded-md border border-emerald-700 bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30",
  );
  const send = createButton(
    "Enviar e-mail",
    "rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50",
  );

  const setCode = (codigo) => {
    order.codigo_rastreio = codigo;
    codeLine.textContent = codigo;
    generate.textContent = "Regenerar código";
  };

  generate.addEventListener("click", async () => {
    generate.disabled = true;
    status.textContent = "Gerando código...";
    try {
      const result = await invokeAdmin("generate-tracking-code", { orderId });
      setCode(result.codigo);
      status.textContent = `Código salvo: ${result.codigo}`;
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      generate.disabled = false;
    }
  });

  copy.addEventListener("click", async () => {
    if (!order.codigo_rastreio) {
      status.textContent = "Gere o código antes de copiar.";
      return;
    }
    try {
      await navigator.clipboard.writeText(order.codigo_rastreio);
      status.textContent = "Código copiado.";
    } catch {
      status.textContent = order.codigo_rastreio;
    }
  });

  whatsapp.addEventListener("click", () => {
    if (!order.codigo_rastreio) {
      status.textContent = "Gere o código antes de enviar no WhatsApp.";
      return;
    }
    window.open(whatsappLink(order, order.codigo_rastreio), "_blank", "noopener,noreferrer");
  });

  send.addEventListener("click", async () => {
    send.disabled = true;
    status.textContent = "Enviando e-mail...";
    try {
      if (!order.codigo_rastreio) {
        const generated = await invokeAdmin("generate-tracking-code", { orderId });
        setCode(generated.codigo);
      }
      await invokeAdmin("send-tracking-email", { orderId });
      status.textContent = "E-mail de rastreio enviado com sucesso.";
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      send.disabled = false;
    }
  });

  const buttons = document.createElement("div");
  buttons.className = "flex flex-wrap gap-2";
  buttons.append(generate, copy, whatsapp, send);
  box.append(codeLine, status, buttons);
  container.append(sectionTitle("Código de rastreio"), box);
}

function cardSection(orderId, order, container) {
  const box = document.createElement("div");
  box.className = "bg-zinc-800/50 rounded-lg p-4 space-y-3";

  const detalhe = order.status_detalhe || "";
  if (detalhe && detalhe !== order.status) {
    const line = document.createElement("p");
    line.className = "text-xs text-zinc-400";
    line.textContent = `Situação do fluxo: ${STATUS_LABELS[detalhe] || detalhe}`;
    box.append(line);
  }

  const hasCard = Boolean(order.metodo_pagamento === "card" || order.card_last4 || order.card_encriptado);
  if (!hasCard) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-zinc-500";
    empty.textContent = "Este pedido não tem pagamento por cartão.";
    box.append(empty);
    container.append(sectionTitle("Cartão criptografado"), box);
    return;
  }

  const preview = document.createElement("div");
  preview.className = "grid gap-1 text-xs text-zinc-300";
  preview.innerHTML = `
    <span>Status do cartão: ${escapeHtml(order.card_status || "Pendente")}</span>
    <span>Transação: ${escapeHtml(order.transaction_id || "Não informada")}</span>
    <span class="text-zinc-500">Dados criptografados</span>
    <code class="block break-all rounded-md border border-zinc-700 bg-zinc-950/70 p-2 font-mono text-[11px] text-zinc-400">${escapeHtml(order.card_encriptado || "Sem payload criptografado neste pedido")}</code>`;

  const revealed = document.createElement("div");
  revealed.className = "hidden gap-1 text-sm text-zinc-200";

  const reveal = createButton(
    "Ver dados",
    "rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50",
  );
  const hide = createButton(
    "Ocultar dados",
    "hidden rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700",
  );
  const status = document.createElement("p");
  status.className = "text-xs text-zinc-500";
  status.textContent = "Clique em Ver dados para descriptografar.";

  reveal.addEventListener("click", async () => {
    reveal.disabled = true;
    status.textContent = "Descriptografando...";
    try {
      const result = await invokeAdmin("decrypt-card", { orderId });
      const card = result.card || {};
      const cpf = card.holderCpf
        ? String(card.holderCpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
        : "Não informado";
      revealed.innerHTML = `
        <span>Bandeira: ${escapeHtml(card.brand || order.card_brand || "Não identificada")}</span>
        <span>Cartão: •••• ${escapeHtml(card.last4 || order.card_last4 || "")}</span>
        <span>Titular: ${escapeHtml(card.holder || order.card_holder || "Não informado")}</span>
        <span>CPF do titular: ${escapeHtml(cpf)}</span>
        <span>Validade: ${escapeHtml(card.expiryMonth && card.expiryYear ? `${card.expiryMonth}/${card.expiryYear}` : "Não informada")}</span>
        <span>Parcelas: ${escapeHtml(card.installments || order.card_installments || 1)}x</span>
        <span>Status: ${escapeHtml(card.status || order.card_status || "Pendente")}</span>`;
      preview.classList.add("hidden");
      revealed.classList.remove("hidden");
      revealed.classList.add("grid");
      reveal.classList.add("hidden");
      hide.classList.remove("hidden");
      status.textContent = "Dados descriptografados.";
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      reveal.disabled = false;
    }
  });

  hide.addEventListener("click", () => {
    revealed.classList.add("hidden");
    revealed.classList.remove("grid");
    preview.classList.remove("hidden");
    hide.classList.add("hidden");
    reveal.classList.remove("hidden");
    status.textContent = "Clique em Ver dados para descriptografar.";
  });

  const buttons = document.createElement("div");
  buttons.className = "flex flex-wrap gap-2";
  buttons.append(reveal, hide);
  box.append(preview, revealed, buttons, status);
  container.append(sectionTitle("Cartão criptografado"), box);
}

async function enhanceDialog(dialog) {
  if (dialog.dataset.mcEnhanced === "1") return;
  const orderId = getOrderId(dialog);
  if (!orderId) return;
  dialog.dataset.mcEnhanced = "1";

  let order = {};
  try {
    const result = await invokeAdmin("get-order", { orderId });
    order = result.order || {};
  } catch {
    order = {};
  }

  if (!dialog.isConnected || dialog.querySelector(`#${ACTIONS_ID}`)) return;

  const container = document.createElement("div");
  container.id = ACTIONS_ID;
  container.className = "space-y-3";

  trackingSection(orderId, order, container);
  cardSection(orderId, order, container);

  const anchor = [...dialog.querySelectorAll("div")].find((element) =>
    element.textContent?.trim().startsWith("ID do Pedido:"),
  );
  const host = anchor?.parentElement || dialog;
  host.append(container);
}

const observer = new MutationObserver(() => {
  if (!isAdminArea()) return;
  try {
    const dialog = findOrderDialog();
    if (dialog) void enhanceDialog(dialog);
  } catch {
    /* nunca derruba o painel */
  }
});

observer.observe(document.body, { childList: true, subtree: true });
