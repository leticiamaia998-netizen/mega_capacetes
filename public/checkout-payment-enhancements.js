const CARD_OPTION_ID = "checkout-card-option";
const CARD_FORM_ID = "checkout-card-fields";

let cardEnabled = false;
let method = "pix";
let intercepting = false;
let lastSignature = "";
let observer = null;

async function loadGateways() {
  try {
    const res = await fetch("/api/gateways");
    const data = await res.json();
    cardEnabled = Boolean(data.cardEnabled);
  } catch {
    cardEnabled = false;
  }
  renderCardOption();
}

function attachPayButtons(card) {
  card.querySelectorAll("[data-pay]").forEach((button) => {
    button.addEventListener("click", () => {
      method = button.getAttribute("data-pay") === "card" ? "card" : "pix";
      renderCardOption();
    });
  });
}

function renderCardOption() {
  const pixLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("PIX"),
  );
  if (!pixLabel?.parentElement) return;

  const signature = `${cardEnabled}:${method}`;
  const existing = document.getElementById(CARD_OPTION_ID);
  if (existing && lastSignature === signature) return;

  observer?.disconnect();
  lastSignature = signature;

  let card = existing;
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_OPTION_ID;
    pixLabel.parentElement.insertBefore(card, pixLabel.nextSibling);
  }

  card.style.marginTop = "12px";
  card.innerHTML = cardEnabled
    ? `
      <button type="button" data-pay="pix" style="width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid ${method === "pix" ? "#0b1f3a" : "#e5e7eb"};background:${method === "pix" ? "#e8f0fb" : "#fff"};border-radius:12px;padding:14px;margin-bottom:8px;cursor:pointer;">
        <span style="font-weight:700;color:#0b1f3a;">PIX</span>
        <span style="font-size:12px;color:#4b5563;">Desconto e aprovação imediata</span>
      </button>
      <button type="button" data-pay="card" style="width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid ${method === "card" ? "#0b1f3a" : "#e5e7eb"};background:${method === "card" ? "#e8f0fb" : "#fff"};border-radius:12px;padding:14px;cursor:pointer;">
        <span style="font-weight:700;color:#0b1f3a;">Cartão de crédito</span>
        <span style="font-size:12px;color:#4b5563;">Venus Pay</span>
      </button>
      <div id="${CARD_FORM_ID}" style="display:${method === "card" ? "grid" : "none"};gap:8px;margin-top:12px;">
        <input data-card="holderName" placeholder="Nome no cartão" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;" />
        <input data-card="number" inputmode="numeric" placeholder="Número do cartão" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;" />
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <input data-card="expiryMonth" inputmode="numeric" placeholder="MM" maxlength="2" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;" />
          <input data-card="expiryYear" inputmode="numeric" placeholder="AA" maxlength="4" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;" />
          <input data-card="cvv" inputmode="numeric" placeholder="CVV" maxlength="4" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;" />
        </div>
        <select data-card="installments" style="height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;">
          ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join("")}
        </select>
      </div>`
    : `
      <div class="mt-3 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-4 opacity-75">
        <div class="flex items-center gap-3">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200 bg-white text-xl">💳</span>
          <div>
            <div class="text-[14px] font-semibold text-neutral-900">Cartão de crédito</div>
            <div class="text-[12px] font-medium text-neutral-500">Indisponível no momento</div>
          </div>
        </div>
        <span class="rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600">Indisponível</span>
      </div>`;

  attachPayButtons(card);
  observer?.observe(document.body, { childList: true, subtree: true });
}

function cardFields() {
  const root = document.getElementById(CARD_FORM_ID);
  const value = (name) => root?.querySelector(`[data-card="${name}"]`)?.value || "";
  return {
    holderName: value("holderName"),
    number: value("number"),
    expiryMonth: value("expiryMonth"),
    expiryYear: value("expiryYear"),
    cvv: value("cvv"),
    installments: Number(value("installments") || 1),
  };
}

async function payWithCard(state) {
  if (intercepting) return;
  intercepting = true;
  const card = cardFields();
  try {
    const res = await fetch("/api/card/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...state,
        amount: state.amount,
        customer: state.customer,
        items: state.items,
        shippingAddress: state.shippingAddress,
        utm: state.utm,
        tracking: state.tracking,
        card,
        installments: card.installments,
      }),
    });
    const data = await res.json();
    if (data.redirect) {
      window.location.href = data.redirect;
      return;
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Não foi possível processar o cartão");
    }
    window.location.href = `/sucesso?payment=card&status=${data.status || "approved"}&orderId=${data.orderId || ""}`;
  } catch (error) {
    intercepting = false;
    alert(error instanceof Error ? error.message : "Erro no pagamento");
  }
}

const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
sessionStorage.setItem = function patchedSetItem(key, value) {
  originalSetItem(key, value);
  if (key === "pixPageState" && method === "card") {
    try {
      void payWithCard(JSON.parse(value));
    } catch {
      intercepting = false;
    }
  }
};

const originalPushState = history.pushState.bind(history);
history.pushState = function patchedPushState(state, title, url) {
  if (method === "card" && String(url || "").includes("/pix")) return;
  return originalPushState(state, title, url);
};

observer = new MutationObserver(() => renderCardOption());
observer.observe(document.body, { childList: true, subtree: true });
loadGateways();
