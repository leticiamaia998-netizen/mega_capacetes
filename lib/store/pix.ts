import { getEnv } from "./env";

export type PixChargeInput = {
  amount: number;
  orderId: string;
  customer: {
    name: string;
    email: string;
    cpf?: string;
    phone?: string;
  };
  items?: Array<{ name?: string; quantity?: number; price?: number }>;
};

export type PixChargeResult = {
  qrCode: string;
  copyPaste: string;
  externalId: string;
  raw: Record<string, unknown>;
};

function digits(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractPix(raw: Record<string, unknown>, fallbackId: string): PixChargeResult {
  const transaction = asObject(raw.data) || asObject(raw.transaction) || raw;
  const pix =
    asObject(transaction.pix) ||
    asObject(transaction.pix_data) ||
    asObject(transaction.payment) ||
    asObject(transaction.payment_data) ||
    transaction;

  const qrCode = String(
    pix.qr_code_base64 || pix.qr_code_image || pix.qr_image || pix.qrcode || pix.qrCode || pix.encodedImage || "",
  );
  const copyPaste = String(
    pix.pix_qr_code ||
      pix.pix_copy_paste ||
      pix.copy_paste ||
      pix.pix_code ||
      pix.pix_qrcode ||
      pix.brcode ||
      pix.emv ||
      pix.qr_code ||
      pix.payload ||
      pix.copyAndPaste ||
      "",
  );
  const externalId = String(
    transaction.transaction_hash ||
      transaction.hash ||
      transaction.id ||
      transaction.charge_id ||
      transaction.transaction_id ||
      raw.id ||
      fallbackId,
  );

  return { qrCode, copyPaste, externalId, raw };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { message: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error(String(data.message || data.error || data.msg || `Gateway HTTP ${res.status}`));
  }
  return data;
}

export async function chargeIronPay(input: PixChargeInput): Promise<PixChargeResult> {
  const token = getEnv("IRONPAY_API_TOKEN");
  const offer = getEnv("IRONPAY_OFFER_HASH");
  const product = getEnv("IRONPAY_PRODUCT_HASH");
  if (!token || !offer || !product) throw new Error("Credenciais IronPay incompletas");

  const amountCents = Math.round(input.amount * 100);
  const data = await postJson(
    "https://api.ironpayapp.com.br/api/public/v1/transactions",
    { Authorization: `Bearer ${token}` },
    {
      api_token: token,
      offer_hash: offer,
      product_hash: product,
      amount: amountCents,
      payment_method: "pix",
      installments: 1,
      cart: (input.items?.length ? input.items : [{ name: "Pedido MegaCapacetes", quantity: 1, price: input.amount }]).map(
        (item) => ({
          offer_hash: offer,
          product_hash: product,
          quantity: Number(item.quantity) || 1,
          price: Math.round((Number(item.price) || input.amount) * 100),
          operation_type: 1,
          title: item.name || "Produto MegaCapacetes",
        }),
      ),
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: digits(input.customer.cpf),
        phone_number: digits(input.customer.phone),
      },
      external_id: input.orderId,
      metadata: { order_id: input.orderId },
    },
  );

  return extractPix(data, input.orderId);
}

export async function chargeMasterFy(input: PixChargeInput): Promise<PixChargeResult> {
  const apiKey = getEnv("MASTERFY_API_KEY");
  if (!apiKey) throw new Error("MASTERFY_API_KEY ausente");

  const data = await postJson(
    "https://api.masterfy.com.br/v1/charges",
    { Authorization: `Bearer ${apiKey}` },
    {
      amount: Math.round(input.amount * 100),
      paymentMethod: "pix",
      payment_method: "pix",
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: digits(input.customer.cpf),
        phone: digits(input.customer.phone),
      },
      items: input.items,
      metadata: { order_id: input.orderId },
      postbackUrl: `${getEnv("SITE_URL", "https://megacapacetes.store")}/api/pix/webhook`,
    },
  );

  return extractPix(data, input.orderId);
}

export async function chargeUmbrellaPag(input: PixChargeInput): Promise<PixChargeResult> {
  const apiKey = getEnv("UMBRELLAPAG_API_KEY");
  if (!apiKey) throw new Error("UMBRELLAPAG_API_KEY ausente");

  const data = await postJson(
    "https://api.umbrellapag.com/v1/transactions",
    { "x-api-key": apiKey },
    {
      amount: Math.round(input.amount * 100),
      paymentMethod: "pix",
      payment_method: "pix",
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: digits(input.customer.cpf),
        phone: digits(input.customer.phone),
      },
      items: input.items,
      metadata: { order_id: input.orderId },
      notificationUrl: `${getEnv("SITE_URL", "https://megacapacetes.store")}/api/pix/webhook`,
    },
  );

  return extractPix(data, input.orderId);
}

export async function chargeVenusPix(input: PixChargeInput): Promise<PixChargeResult> {
  const secretKey = getEnv("VENUS_PAY_SECRET_KEY");
  if (!secretKey) throw new Error("VENUS_PAY_SECRET_KEY ausente");

  const data = await postJson(
    "https://mdjmtirsrhqrurkiqffb.supabase.co/functions/v1/process-payment",
    { Authorization: `Bearer ${secretKey}` },
    {
      amount: Number(input.amount.toFixed(2)),
      payment_method: "pix",
      product: { id: getEnv("VENUS_PAY_PRODUCT_ID") || undefined, name: "Pedido Mega Capacetes" },
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        document: digits(input.customer.cpf),
        phone: digits(input.customer.phone),
      },
      metadata: { source: "mega_capacetes", order_id: input.orderId },
    },
  );

  return extractPix(data, input.orderId);
}

export async function createPixCharge(code: string, input: PixChargeInput) {
  switch (code) {
    case "masterfy":
      return chargeMasterFy(input);
    case "umbrellapag":
      return chargeUmbrellaPag(input);
    case "venuspay":
    case "venuspay_pix":
      return chargeVenusPix(input);
    case "ironpay":
    default:
      return chargeIronPay(input);
  }
}
