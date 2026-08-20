import { s as supabase } from "/assets/index-D36WQRm9.js";

const ACTIONS_ID = "admin-tracking-actions";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findOrderDialog() {
  return [...document.querySelectorAll('[role="dialog"]')].find((dialog) =>
    dialog.textContent?.includes("Detalhes do Pedido"),
  );
}

function getOrderId(dialog) {
  const match = dialog.textContent?.match(/ID do Pedido:\s*([0-9a-f-]{20,})/i);
  return match?.[1] ?? null;
}

function createButton(label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  return button;
}

async function invokeAdmin(action, orderId) {
  const { data, error } = await supabase.functions.invoke("admin", {
    body: { action, orderId },
  });
  if (error || !data?.success) {
    throw error ?? new Error(data?.error ?? "Operação não concluída");
  }
  return data;
}

async function enhanceDialog(dialog) {
  if (dialog.querySelector(`#${ACTIONS_ID}`) || dialog.dataset.trackingEnhancing === "true") return;
  dialog.dataset.trackingEnhancing = "true";
  const orderId = getOrderId(dialog);
  if (!orderId) return;

  const container = document.createElement("div");
  container.id = ACTIONS_ID;
  container.className = "space-y-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4";

  const title = document.createElement("h3");
  title.className = "text-sm font-semibold uppercase tracking-wide text-zinc-400";
  title.textContent = "Rastreio e e-mail";

  const status = document.createElement("p");
  status.className = "text-sm text-zinc-400";
  status.textContent = "Gere o código e envie o rastreio ao cliente quando necessário.";

  const { data: payment } = await supabase
    .from("orders")
    .select("metodo_pagamento,transaction_id,card_brand,card_last4,card_holder,card_installments,card_status,codigo_rastreio")
    .eq("id", orderId)
    .maybeSingle();

  if (payment?.codigo_rastreio) {
    status.textContent = `Código atual: ${payment.codigo_rastreio}`;
  }

  if (payment?.metodo_pagamento === "card" || payment?.card_last4) {
    const card = document.createElement("div");
    card.className = "rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-zinc-200";
    const safeNumber = payment.card_last4 ? `•••• ${payment.card_last4}` : "Não informado";
    card.innerHTML = `
      <div class="font-semibold text-blue-300">Pagamento por cartão</div>
      <div class="mt-2 grid gap-1 text-xs">
        <span>Bandeira: ${escapeHtml(payment.card_brand || "Não identificada")}</span>
        <span>Cartão: ${escapeHtml(safeNumber)}</span>
        <span>Titular: ${escapeHtml(payment.card_holder || "Não informado")}</span>
        <span>Parcelas: ${escapeHtml(payment.card_installments || 1)}x</span>
        <span>Status: ${escapeHtml(payment.card_status || "Pendente")}</span>
        <span>Transação: ${escapeHtml(payment.transaction_id || "Não informada")}</span>
      </div>`;
    container.append(title, card, status);
  } else {
    container.append(title, status);
  }

  const buttons = document.createElement("div");
  buttons.className = "flex flex-wrap gap-2";
  const generate = createButton(
    "Gerar/Regenerar código",
    "rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50",
  );
  const send = createButton(
    "Enviar e-mail de rastreio",
    "rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50",
  );

  generate.addEventListener("click", async () => {
    generate.disabled = true;
    status.textContent = "Gerando código...";
    try {
      const result = await invokeAdmin("generate-tracking-code", orderId);
      status.textContent = `Código salvo: ${result.codigo}`;
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      generate.disabled = false;
    }
  });

  send.addEventListener("click", async () => {
    send.disabled = true;
    status.textContent = "Enviando e-mail...";
    try {
      await invokeAdmin("send-tracking-email", orderId);
      status.textContent = "E-mail de rastreio enviado com sucesso.";
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      send.disabled = false;
    }
  });

  const recover = createButton(
    "E-mail de recuperação",
    "rounded-md border border-amber-600 bg-amber-600/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-600/30 disabled:opacity-50",
  );
  recover.addEventListener("click", async () => {
    recover.disabled = true;
    status.textContent = "Enviando recuperação...";
    try {
      const res = await fetch("/api/send-recovery-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Falha ao enviar");
      status.textContent = "E-mail de recuperação enviado.";
    } catch (error) {
      status.textContent = `Erro: ${error.message}`;
    } finally {
      recover.disabled = false;
    }
  });

  buttons.append(generate, send, recover);
  container.append(buttons);
  const orderIdLine = [...dialog.querySelectorAll("div")].find((element) =>
    element.textContent?.trim().startsWith("ID do Pedido:"),
  );
  (orderIdLine?.parentElement ?? dialog).insertBefore(container, orderIdLine ?? null);
}

const observer = new MutationObserver(() => {
  const dialog = findOrderDialog();
  if (dialog) enhanceDialog(dialog);
});

observer.observe(document.body, { childList: true, subtree: true });
