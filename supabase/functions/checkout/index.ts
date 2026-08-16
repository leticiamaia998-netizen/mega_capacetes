// ============================================================
// SUPABASE EDGE FUNCTION: checkout
// Operações do checkout (salvar abandono, recuperação)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { action } = body;

    // ── SALVAR ABANDONO DE CARRINHO ───────────────────────────
    if (action === "save-abandoned") {
      const { email, nome, produtos, valor, utm } = body;

      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "Email obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar se já existe um pedido recente com este email
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, status, created_at")
        .eq("email", email)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Só salvar abandono se não completou compra recentemente
      if (existingOrder && ["pago"].includes(existingOrder.status)) {
        return new Response(JSON.stringify({ success: true, action: "skipped" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar ou atualizar pedido abandonado
      const { data: order, error } = await supabase
        .from("orders")
        .upsert({
          email,
          nome,
          produtos,
          valor,
          utm,
          status: "abandonou",
          metodo_pagamento: "pix",
        }, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;

      // Agendar email de recuperação (via Edge Function async)
      // Em produção, use um cron job ou pg_cron para isso
      console.log(`Abandono registrado: ${email} (pedido ${order?.id})`);

      return new Response(JSON.stringify({ success: true, orderId: order?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ENVIAR EMAIL DE RECUPERAÇÃO ───────────────────────────
    if (action === "send-recovery") {
      const { orderId } = body;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const { data: order } = await supabase
        .from("orders")
        .select("id, nome, email, produtos, valor")
        .eq("id", orderId)
        .single();

      if (!order) {
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enviar email de recuperação via Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@megacapacetes.store";
      const siteUrl = "https://megacapacetes.store";
      const storeName = "Mega Capacetes";

      const nomeFirst = (order.nome as string)?.split(" ")[0] ?? "Cliente";
      const valor = (order.valor as number)?.toFixed(2) ?? "0.00";

      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#111827;padding:28px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">${storeName}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;">
            <h2 style="color:#111827;margin:0 0 12px;font-size:22px;">Oi, ${nomeFirst}! Você esqueceu algo 😉</h2>
            <p style="color:#4b5563;margin:0 0 24px;font-size:15px;line-height:1.6;">
              Você visitou nossa loja mas não finalizou seu pedido. Ainda dá tempo de garantir seus itens!
            </p>
            <div style="background:#f9fafb;border-radius:10px;padding:18px;margin-bottom:24px;">
              <p style="margin:0 0 6px;color:#111827;font-weight:700;">Total: R$ ${valor}</p>
              <p style="margin:0;color:#6b7280;font-size:13px;">Itens reservados por tempo limitado</p>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${siteUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">
                    Finalizar minha compra →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">© 2026 ${storeName}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${storeName} <${fromEmail}>`,
          to: [order.email as string],
          subject: `${nomeFirst}, você esqueceu seu pedido! 🛵`,
          html,
        }),
      });

      return new Response(
        JSON.stringify({ success: resendRes.ok }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("checkout function error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
