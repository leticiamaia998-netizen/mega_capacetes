const ACTIONS_ID = "admin-tracking-actions";
const FILTER_ID = "admin-paid-no-tracking";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAccessToken() {
  for (const key of Object.keys(localStorage)) {
    if (!key.includes("auth-token")) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return (
        value?.access_token ||
        value?.currentSession?.access_token ||
        value?.session?.access_token ||
        null
      );
    } catch {
      /* ignore */
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
  const data = await res.json();
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

async function enhanceDialog(dialog) {
  if (dialog.querySelector(`#${ACTIONS_ID}`)) return;
  const orderId = getOrderId(dialog);
  if (!orderId) return;

  const container = document.createElement("div");
  container.id = ACTIONS_ID;
  container.className = "space-y-3";

  const title = document.createElement("h3");
  title.className = "text-sm font-semibold text-zinc-400 uppercase tracking-wide";
  title.textContent = "Código de rastreio";

  const box = document.createElement("div");
  box.className = "bg-zinc-800/50 rounded-lg p-4 space-y-3";

  const status = document.createElement("p");
  status.className = "text-sm text-zinc-400";
  status.textContent = "Gere o código, envie por WhatsApp ou e-mail.";

  const codeLine = document.createElement("p");
  codeLine.className = "font-mono text-lg font-bold text-emerald-400 tracking-widest";
  codeLine.textContent = "—";

  let order = {};
  try {
    const result = await invokeAdmin("get-order", { orderId });
    order = result.order || {};
  } catch (error) {
    status.textContent = `Erro: ${error.message}`;
  }

  const currentCode = order.codigo_rastreio || "";
  if (currentCode) {
    codeLine.textContent = currentCode;
    status.textContent = "Código salvo neste pedido.";
  }

  const buttons = document.createElement("div");
  buttons.className = "flex flex-wrap gap-2";

  const generate = createButton(
    currentCode ? "Regenerar código" : "Gerar código",
    "rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50",
  );
  const copy = createButton(
    "Copiar",
    "rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50",
  );
  const whatsapp = createButton(
    "WhatsApp",
    "rounded-md border border-emerald-700 bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50",
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
    const codigo = order.codigo_rastreio;
    if (!codigo) {
      status.textContent = "Gere o código antes de copiar.";
      return;
    }
    try {
      await navigator.clipboard.writeText(codigo);
      status.textContent = "Código copiado.";
    } catch {
      status.textContent = codigo;
    }
  });

  whatsapp.addEventListener("click", () => {
    const codigo = order.codigo_rastreio;
    if (!codigo) {
      status.textContent = "Gere o código antes de enviar no WhatsApp.";
      return;
    }
    window.open(whatsappLink(order, codigo), "_blank", "noopener,noreferrer");
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

  buttons.append(generate, copy, whatsapp, send);
  box.append(codeLine, status, buttons);
  container.append(title, box);

  if (order.metodo_pagamento === "card" || order.card_last4 || order.card_encriptado) {
    const card = document.createElement("div");
    card.className = "rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-zinc-200";
    const encrypted = String(order.card_encriptado || "");
    const preview = encrypted ? `${encrypted.slice(0, 28)}…` : "••••";
    card.innerHTML = `
      <div class="font-semibold text-blue-300">Pagamento por cartão</div>
      <div class="mt-2 grid gap-1 text-xs" data-card-preview>
        <span>Status: ${escapeHtml(order.card_status || "Pendente")}</span>
        <span>Dados criptografados: ${escapeHtml(preview)}</span>
      </div>
      <button type="button" data-reveal-card class="mt-3 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
        Ver dados
      </button>`;
    card.querySelector("[data-reveal-card]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Descriptografando...";
      try {
        const result = await invokeAdmin("decrypt-card", { orderId });
        const data = result.card || {};
        card.querySelector("[data-card-preview]").innerHTML = `
          <span>Bandeira: ${escapeHtml(data.brand || order.card_brand || "Não identificada")}</span>
          <span>Cartão: •••• ${escapeHtml(data.last4 || order.card_last4 || "")}</span>
          <span>Titular: ${escapeHtml(data.holder || order.card_holder || "Não informado")}</span>
          <span>Validade: ${escapeHtml(data.expiryMonth && data.expiryYear ? `${data.expiryMonth}/${data.expiryYear}` : "Não informada")}</span>
          <span>Parcelas: ${escapeHtml(data.installments || order.card_installments || 1)}x</span>`;
        button.textContent = "Dados visíveis";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Ver dados";
        status.textContent = `Erro: ${error.message}`;
      }
    });
    container.append(card);
  }

  const orderIdLine = [...dialog.querySelectorAll("div")].find((element) =>
    element.textContent?.trim().startsWith("ID do Pedido:"),
  );
  (orderIdLine?.parentElement ?? dialog).insertBefore(container, orderIdLine ?? null);
}

async function enhancePaidFilter() {
  if (document.getElementById(FILTER_ID)) return;
  const search = document.querySelector('input[placeholder*="Buscar por nome"]');
  if (!search?.parentElement?.parentElement) return;

  const wrap = document.createElement("div");
  wrap.id = FILTER_ID;
  wrap.className = "mt-3";
  const button = createButton(
    "Pagos sem rastreio",
    "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800",
  );
  const info = document.createElement("p");
  info.className = "mt-2 text-xs text-zinc-500";
  info.textContent = "Abra o pedido e use Gerar código + WhatsApp ou e-mail.";

  button.addEventListener("click", async () => {
    button.disabled = true;
    info.textContent = "Buscando...";
    try {
      const result = await invokeAdmin("get-orders", { limit: 100, page: 1 });
      const missing = (result.orders || []).filter((order) => {
        const paid = ["paid", "pago"].includes(String(order.status || "").toLowerCase());
        return paid && !order.codigo_rastreio;
      });
      info.textContent = missing.length
        ? `${missing.length} pedido(s) pago(s) sem código. Abra o pedido na lista para gerar e enviar.`
        : "Todos os pedidos pagos já têm código de rastreio.";
    } catch (error) {
      info.textContent = `Erro: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });

  wrap.append(button, info);
  search.parentElement.parentElement.append(wrap);
}

const observer = new MutationObserver(() => {
  const dialog = findOrderDialog();
  if (dialog) enhanceDialog(dialog);
  enhancePaidFilter();
});

observer.observe(document.body, { childList: true, subtree: true });
enhancePaidFilter();
