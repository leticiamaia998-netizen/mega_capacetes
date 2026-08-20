import { getEnv } from "./env";

export const CARD_DECLINE_MESSAGE =
  "Não foi possível pagar com este cartão. Tente novamente com outro cartão.";

export type CardInput = {
  number: string;
  cvv: string;
  expiryMonth: string | number;
  expiryYear: string | number;
  holderName?: string;
};

export type CardMeta = {
  brand: string;
  last4: string;
  holder: string;
  expiryMonth: string;
  expiryYear: string;
  installments: number;
};

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
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

async function aesKey() {
  const secret = encryptionSecret();
  if (!secret) return null;
  const keyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptCardMeta(meta: CardMeta) {
  const key = await aesKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(meta)),
  );
  const bytes = new Uint8Array(iv.length + encrypted.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(encrypted), iv.length);
  return bytesToB64(bytes);
}

export async function decryptCardMeta(payload: string): Promise<CardMeta | null> {
  const key = await aesKey();
  if (!key || !payload) return null;
  try {
    const bytes = b64ToBytes(payload);
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as CardMeta;
    return parsed;
  } catch {
    return null;
  }
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
  const parsedInstallments = Math.max(1, Math.min(12, Number(installments) || 1));

  if (cardNumber.length < 13 || cardNumber.length > 19 || !passesLuhn(cardNumber)) {
    return { error: "Dados do cartão inválidos" as const };
  }
  if (cvv.length < 3 || cvv.length > 4 || monthNum < 1 || monthNum > 12 || yearNum < 2000) {
    return { error: "Validade ou código de segurança inválido" as const };
  }

  const meta: CardMeta = {
    brand: cardBrand(cardNumber),
    last4: cardNumber.slice(-4),
    holder,
    expiryMonth,
    expiryYear: expiryYear.slice(-2),
    installments: parsedInstallments,
  };

  return { cardNumber, cvv, expiryMonth: monthNum, expiryYear: yearNum, holder, installments: parsedInstallments, meta };
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
  const encrypted = await encryptCardMeta(parsed.meta);

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
      document: digits(input.order.cpf),
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

  const gatewayResponse = await fetch("https://mdjmtirsrhqrurkiqffb.supabase.co/functions/v1/process-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretKey}` },
    body: JSON.stringify(payload),
  });
  const gateway = (await gatewayResponse.json()) as Record<string, unknown>;
  const transactionId = String(gateway.transaction_id || gateway.id || "");
  const approved = gateway.success === true && Boolean(transactionId);

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
}
