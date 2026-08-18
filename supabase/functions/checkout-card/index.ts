import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_ORIGINS = new Set([
  "https://mega-capacetes.leticiamaia998.workers.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && SITE_ORIGINS.has(origin) ? origin : "https://mega-capacetes.leticiamaia998.workers.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function passesLuhn(cardNumber: string) {
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

function cardBrand(number: string) {
  if (/^4/.test(number)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "Mastercard";
  if (/^3[47]/.test(number)) return "American Express";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(number)) return "Elo";
  if (/^(606282|3841)/.test(number)) return "Hipercard";
  return "Cartão";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, headers);
  if (origin && !SITE_ORIGINS.has(origin)) return json({ error: "Origem não autorizada" }, 403, headers);

  const secretKey = Deno.env.get("VENUS_PAY_SECRET_KEY");
  const productId = Deno.env.get("VENUS_PAY_PRODUCT_ID");
  if (!secretKey) {
    return json({ configured: false, error: "Pagamento por cartão ainda não configurado" }, 503, headers);
  }

  try {
    const body = await req.json();
    const orderId = String(body.orderId ?? "");
    const cardNumber = digits(body.card?.number);
    const cvv = digits(body.card?.cvv);
    const expiryMonth = Number(digits(body.card?.expiryMonth));
    const expiryYearRaw = digits(body.card?.expiryYear);
    const expiryYear = Number(expiryYearRaw.length === 2 ? `20${expiryYearRaw}` : expiryYearRaw);
    const installments = Math.max(1, Math.min(12, Number(body.installments) || 1));

    if (!orderId || cardNumber.length < 13 || cardNumber.length > 19 || !passesLuhn(cardNumber)) {
      return json({ error: "Dados do cartão inválidos" }, 400, headers);
    }
    if (cvv.length < 3 || cvv.length > 4 || expiryMonth < 1 || expiryMonth > 12 || expiryYear < new Date().getUTCFullYear()) {
      return json({ error: "Validade ou código de segurança inválido" }, 400, headers);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,nome,email,telefone,cpf,valor,produtos,cep,rua,numero,complemento,bairro,cidade,estado,status")
      .eq("id", orderId)
      .single();
    if (orderError || !order) return json({ error: "Pedido não encontrado" }, 404, headers);
    if (["pago", "paid"].includes(String(order.status))) return json({ error: "Pedido já pago" }, 409, headers);

    const holder = String(body.card?.holderName || order.nome || "").trim().slice(0, 100);
    const payload = {
      amount: Number(Number(order.valor).toFixed(2)),
      payment_method: "credit_card",
      product: productId ? { id: productId, name: "Pedido Mega Capacetes" } : { name: "Pedido Mega Capacetes" },
      customer: { name: order.nome, email: order.email, document: digits(order.cpf), phone: digits(order.telefone) },
      card_data: { number: cardNumber, holder_name: holder, expiration_month: expiryMonth, expiration_year: expiryYear, cvv, installments },
      address: { zip_code: digits(order.cep), street: order.rua, number: order.numero || "S/N", complement: order.complemento || "", neighborhood: order.bairro || "", city: order.cidade, state: String(order.estado || "").slice(0, 2), country: "BR" },
      metadata: { source: "mega_capacetes", order_id: order.id },
    };

    const gatewayResponse = await fetch("https://mdjmtirsrhqrurkiqffb.supabase.co/functions/v1/process-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${secretKey}` },
      body: JSON.stringify(payload),
    });
    const gateway = await gatewayResponse.json();
    const transactionId = gateway.transaction_id || gateway.id || null;
    const approved = gateway.success === true && transactionId;
    const status = approved ? "pago" : "cartao_recusado";

    const { error: updateError } = await supabase.from("orders").update({
      metodo_pagamento: "card",
      transaction_id: transactionId,
      status,
      paid_at: approved ? new Date().toISOString() : null,
      card_brand: cardBrand(cardNumber),
      card_last4: cardNumber.slice(-4),
      card_holder: holder,
      card_installments: installments,
      card_status: approved ? "approved" : String(gateway.status || "declined"),
    }).eq("id", order.id);
    if (updateError) throw updateError;

    return json({ success: Boolean(approved), status: approved ? "approved" : "declined", transactionId }, 200, headers);
  } catch (error) {
    console.error("checkout-card:", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Erro ao processar cartão" }, 500, headers);
  }
});
