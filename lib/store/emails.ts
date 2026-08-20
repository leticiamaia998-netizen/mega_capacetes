import { getEnv, STORE } from "./env";
import { isPaidStatus, sbInsert, sbUpdate, type OrderRow } from "./supabase";

export async function sendTrackingEmail(input: {
  email: string;
  nomeCliente?: string | null;
  codigoRastreio: string;
}) {
  const resendKey = getEnv("RESEND_API_KEY");
  const fromEmail = getEnv("RESEND_FROM_EMAIL", "contato@megacapacetes.store");
  if (!resendKey) throw new Error("RESEND_API_KEY não configurada");

  const nomeFirst = String(input.nomeCliente || "Cliente").split(" ")[0];
  const rastreioUrl = `${STORE.siteUrl()}/rastrear-pedido?codigo=${input.codigoRastreio}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" style="background:#f4f4f5;padding:32px 0;"><tr><td align="center">
<table width="560" style="background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0b1f3a;padding:32px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:22px;">${STORE.name}</h1>
<p style="color:#9ca3af;margin:6px 0 0;font-size:13px;">Capacetes e equipamentos para moto</p>
</td></tr>
<tr><td style="padding:40px;">
<h2 style="color:#0b1f3a;margin:0 0 8px;">Seu pedido foi enviado</h2>
<p style="color:#4b5563;font-size:15px;">Olá, <strong>${nomeFirst}</strong>! Use o código abaixo para acompanhar a entrega.</p>
<div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
<p style="margin:0 0 8px;color:#15803d;font-size:12px;font-weight:700;letter-spacing:1px;">CÓDIGO DE RASTREIO</p>
<p style="margin:0;color:#0b1f3a;font-size:28px;font-weight:800;letter-spacing:4px;">${input.codigoRastreio}</p>
</div>
<p style="text-align:center;"><a href="${rastreioUrl}" style="display:inline-block;background:#0b1f3a;color:#fff;text-decoration:none;font-weight:700;padding:14px 36px;border-radius:10px;">Rastrear meu pedido</a></p>
<p style="color:#6b7280;font-size:13px;">Prazo estimado: 7 a 10 dias úteis após a postagem.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${STORE.name} <${fromEmail}>`,
      to: [input.email],
      subject: `Seu pedido foi enviado! Código: ${input.codigoRastreio}`,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function sendRecoveryEmail(order: Pick<OrderRow, "nome" | "email" | "valor">) {
  const resendKey = getEnv("RESEND_API_KEY");
  const fromEmail = getEnv("RESEND_FROM_EMAIL", "contato@megacapacetes.store");
  if (!resendKey) throw new Error("RESEND_API_KEY não configurada");
  if (!order.email) throw new Error("Pedido sem e-mail");

  const nomeFirst = String(order.nome || "Cliente").split(" ")[0];
  const valor = Number(order.valor || 0).toFixed(2);
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" style="padding:32px 0;"><tr><td align="center">
<table width="560" style="background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0b1f3a;padding:28px;text-align:center;color:#fff;font-size:20px;font-weight:700;">${STORE.name}</td></tr>
<tr><td style="padding:36px;">
<h2 style="color:#0b1f3a;">Oi, ${nomeFirst}! Você esqueceu algo</h2>
<p style="color:#4b5563;">Seu pedido ainda está disponível. Total: <strong>R$ ${valor}</strong></p>
<p style="text-align:center;margin-top:24px;"><a href="${STORE.siteUrl()}/carrinho" style="background:#0b1f3a;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;">Finalizar minha compra</a></p>
</td></tr></table></td></tr></table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${STORE.name} <${fromEmail}>`,
      to: [order.email],
      subject: `${nomeFirst}, você esqueceu seu pedido na ${STORE.name}`,
      html,
    }),
  });
  return res.ok;
}

export async function sendFbPurchase(order: OrderRow) {
  const pixelId = getEnv("FB_PIXEL_ID");
  const token = getEnv("FB_ACCESS_TOKEN");
  if (!pixelId || !token) return { skipped: true };

  const email = String(order.email || "").toLowerCase().trim();
  const hashedEmail = email
    ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email))))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    : undefined;

  const utm = (order.utm || {}) as Record<string, string>;
  const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_source_url: utm.page_url || STORE.siteUrl(),
          user_data: { em: hashedEmail ? [hashedEmail] : undefined, fbc: utm.fbc, fbp: utm.fbp },
          custom_data: { currency: "BRL", value: order.valor, order_id: order.id },
        },
      ],
    }),
  });
  return res.json();
}

export async function sendUtmify(order: OrderRow) {
  const token = getEnv("UTMIFY_API_TOKEN");
  if (!token) return { skipped: true };
  const utm = (order.utm || {}) as Record<string, string>;
  const produtos = Array.isArray(order.produtos) ? order.produtos : [];
  const res = await fetch("https://api.utmify.com.br/api-credentials/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-token": token },
    body: JSON.stringify({
      order_id: order.id,
      total: order.valor,
      currency: "BRL",
      payment_method: order.metodo_pagamento || "pix",
      status: "paid",
      customer: { name: order.nome, email: order.email },
      items: produtos.length
        ? produtos.map((p: { name?: string; quantity?: number; price?: number }) => ({
            name: p.name || "Produto",
            quantity: p.quantity || 1,
            price: p.price || 0,
          }))
        : [{ name: "Pedido", quantity: 1, price: order.valor }],
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term: utm.utm_term,
      utm_content: utm.utm_content,
    }),
  });
  if (res.ok && !order.utmify_sent) {
    await sbUpdate("orders", `id=eq.${order.id}`, { utmify_sent: true });
  }
  return res.json().catch(() => ({}));
}

export async function notifyAdmin(tipo: string, titulo: string, mensagem: string, orderId: string) {
  await sbInsert("notifications", {
    tipo,
    titulo,
    title: titulo,
    mensagem,
    message: mensagem,
    order_id: orderId,
    lida: false,
    is_read: false,
  }).catch(() => null);
}

export { isPaidStatus };
