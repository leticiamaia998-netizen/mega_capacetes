import { getEnv } from "./env";

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
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) return "Elo";
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartão";
}

async function encryptCard(payload: string) {
  const secret = getEnv("ENCRYPT_KEY") || getEnv("VITE_ENCRYPT_KEY");
  if (!secret) return null;
  const keyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(iv.length + encrypted.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(encrypted), iv.length);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
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
  card: {
    number: string;
    cvv: string;
    expiryMonth: string | number;
    expiryYear: string | number;
    holderName?: string;
  };
  installments?: number;
}) {
  const secretKey = getEnv("VENUS_PAY_SECRET_KEY");
  const productId = getEnv("VENUS_PAY_PRODUCT_ID");
  if (!secretKey) {
    return { configured: false as const, error: "Pagamento por cartão ainda não configurado" };
  }

  const cardNumber = digits(input.card.number);
  const cvv = digits(input.card.cvv);
  const expiryMonth = Number(digits(input.card.expiryMonth));
  const expiryYearRaw = digits(input.card.expiryYear);
  const expiryYear = Number(expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw);
  const installments = Math.max(1, Math.min(12, Number(input.installments) || 1));
  const holder = String(input.card.holderName || input.order.nome || "").trim().slice(0, 100);

  if (cardNumber.length < 13 || cardNumber.length > 19 || !passesLuhn(cardNumber)) {
    return { error: "Dados do cartão inválidos", configured: true as const };
  }
  if (cvv.length < 3 || cvv.length > 4 || expiryMonth < 1 || expiryMonth > 12) {
    return { error: "Validade ou código de segurança inválido", configured: true as const };
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
      number: cardNumber,
      holder_name: holder,
      expiration_month: expiryMonth,
      expiration_year: expiryYear,
      cvv,
      installments,
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
  const encrypted = await encryptCard(
    JSON.stringify({ brand: cardBrand(cardNumber), last4: cardNumber.slice(-4), holder, installments }),
  );

  return {
    configured: true as const,
    approved,
    transactionId,
    brand: cardBrand(cardNumber),
    last4: cardNumber.slice(-4),
    holder,
    installments,
    encrypted,
    gateway,
    error: approved ? undefined : String(gateway.message || gateway.error || gateway.status || "Cartão recusado"),
  };
}
