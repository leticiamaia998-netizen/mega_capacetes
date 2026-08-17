import { s as supabase } from "/assets/index-D36WQRm9.js";

const ACTIONS_ID = "admin-tracking-actions";

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

function enhanceDialog(dialog) {
  if (dialog.querySelector(`#${ACTIONS_ID}`)) return;
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

  buttons.append(generate, send);
  container.append(title, status, buttons);
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
