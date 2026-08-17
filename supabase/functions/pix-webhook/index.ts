// ============================================================
// SUPABASE EDGE FUNCTION: pix-webhook
// Webhook da IronPay — recebe notificação de PIX pago
// Configure a URL no painel IronPay:
//   https://<projeto>.supabase.co/functions/v1/pix-webhook
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRACKING_PREFIX = "MC";

function gerarCodigoRastreio(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = TRACKING_PREFIX;
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    console.log("IronPay webhook recebido:", JSON.stringify(body));

    // IronPay envia diferentes formatos dependendo do plano
    // Campos comuns: status, external_id, transaction_id, amount
    const status = body.status || body.payment_status;
    const externalId = body.external_id || body.order_id || body.metadata?.order_id;

    // Só processar se for pagamento confirmado
    if (!["paid", "approved", "completed", "PAID", "APPROVED"].includes(status)) {
      return new Response(JSON.stringify({ received: true, action: "ignored", status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!externalId) {
      console.error("Webhook sem external_id:", body);
      return new Response(JSON.stringify({ error: "external_id não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar pedido pelo ID (external_id = order.id)
    const { data: order } = await supabase
      .from("orders")
      .select("id, nome, email, status, codigo_rastreio, purchase_sent, valor, produtos, utm")
      .eq("id", externalId)
      .single();

    if (!order) {
      // Tentar por transaction_id
      const { data: orderByTx } = await supabase
        .from("orders")
        .select("id, nome, email, status, codigo_rastreio, purchase_sent, valor, produtos, utm")
        .eq("transaction_id", body.id || body.charge_id || "")
        .single();

      if (!orderByTx) {
        console.error("Pedido não encontrado para external_id:", externalId);
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return processarPagamento(supabase, orderByTx, body);
    }

    // Evitar processar duas vezes
    if (order.status === "pago" || order.status === "paid") {
      return new Response(JSON.stringify({ received: true, action: "already_paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return processarPagamento(supabase, order, body);

  } catch (err) {
    console.error("pix-webhook error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processarPagamento(
  supabase: ReturnType<typeof createClient>,
  order: Record<string, unknown>,
  webhookBody: Record<string, unknown>
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // Gerar código de rastreio
  const codigo = (order.codigo_rastreio as string) || gerarCodigoRastreio();

  // Atualizar pedido
  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      status: "pago",
      paid_at: new Date().toISOString(),
      codigo_rastreio: codigo,
      transaction_id: String(webhookBody.id || webhookBody.charge_id || ""),
    })
    .eq("id", order.id);
  if (orderUpdateError) throw orderUpdateError;

  // Salvar rastreio_origem (se ainda não existe)
  if (!order.codigo_rastreio) {
    const { error: trackingError } = await supabase.from("rastreio_origem").insert({
      codigo,
      nome_cliente: order.nome as string,
      order_id: order.id as string,
    });
    if (trackingError && trackingError.code !== "23505") throw trackingError;
  }

  // Notificação admin
  await supabase.from("notifications").insert({
    tipo: "pagamento_confirmado",
    titulo: "Pagamento PIX confirmado!",
    mensagem: `${order.nome} - R$ ${(order.valor as number)?.toFixed(2)}`,
    order_id: order.id as string,
  }).catch(() => {});

  // Enviar email de rastreio
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-tracking-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey },
    body: JSON.stringify({
      orderId: order.id,
      codigoRastreio: codigo,
      nomeCliente: order.nome,
      email: order.email,
    }),
  });
  if (!emailResponse.ok) {
    console.error("Erro email rastreio:", await emailResponse.text());
  }

  // FB Purchase
  if (!order.purchase_sent) {
    await fetch(`${supabaseUrl}/functions/v1/fb-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        orderId: order.id,
        valor: order.valor,
        email: order.email,
        utm: order.utm,
      }),
    }).catch((e) => console.error("Erro FB Purchase:", e));

    await supabase.from("orders").update({ purchase_sent: true }).eq("id", order.id);
  }

  // UTMify
  await fetch(`${supabaseUrl}/functions/v1/utmify-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      orderId: order.id,
      valor: order.valor,
      email: order.email,
      nome: order.nome,
      produtos: order.produtos,
      utm: order.utm,
    }),
  }).catch((e) => console.error("Erro UTMify:", e));

  console.log(`✅ Pedido ${order.id} marcado como PAGO. Rastreio: ${codigo}`);

  return new Response(
    JSON.stringify({ received: true, action: "paid", orderId: order.id, codigo }),
    { headers: corsHeaders }
  );
}
