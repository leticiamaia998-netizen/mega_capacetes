// ============================================================
// SUPABASE EDGE FUNCTION: send-tracking-email
// Envia email com código de rastreio via Resend
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://megacapacetes.store";
const STORE_NAME = "Mega Capacetes";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orderId, codigoRastreio, nomeCliente, email } = await req.json();

    if (!email || !codigoRastreio) {
      return new Response(
        JSON.stringify({ error: "email e codigoRastreio são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? `noreply@megacapacetes.store`;

    const nomeFirst = nomeCliente?.split(" ")[0] ?? "Cliente";
    const rastreioUrl = `${SITE_URL}/rastrear-pedido?codigo=${codigoRastreio}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu pedido foi enviado! - ${STORE_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${STORE_NAME}</h1>
              <p style="color:#9ca3af;margin:6px 0 0;font-size:13px;">Peças e Capacetes para Motocicletas</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="color:#111827;margin:0 0 8px;font-size:24px;font-weight:700;">🎉 Seu pedido foi enviado!</h2>
              <p style="color:#4b5563;margin:0 0 28px;font-size:15px;line-height:1.6;">
                Olá, <strong>${nomeFirst}</strong>! Seu pedido foi aprovado e já está a caminho. Use o código abaixo para acompanhar a entrega.
              </p>

              <!-- Código de rastreio -->
              <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#15803d;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Código de Rastreio</p>
                <p style="margin:0;color:#111827;font-size:28px;font-weight:800;letter-spacing:4px;font-family:monospace;">${codigoRastreio}</p>
              </div>

              <!-- Botão rastrear -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${rastreioUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">
                      Rastrear meu pedido →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Prazo -->
              <div style="background:#f9fafb;border-radius:10px;padding:18px;margin-bottom:28px;">
                <p style="margin:0 0 4px;color:#111827;font-size:14px;font-weight:600;">📦 Prazo estimado de entrega</p>
                <p style="margin:0;color:#6b7280;font-size:14px;">7 a 10 dias úteis após postagem</p>
              </div>

              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
                Caso tenha dúvidas, entre em contato pelo site: 
                <a href="${SITE_URL}/fale-conosco" style="color:#111827;font-weight:600;">${SITE_URL}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © 2026 ${STORE_NAME} · <a href="${SITE_URL}" style="color:#6b7280;">${SITE_URL}</a>
              </p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">
                Você está recebendo este email porque realizou uma compra em nossa loja.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${STORE_NAME} <${fromEmail}>`,
        to: [email],
        subject: `📦 Seu pedido foi enviado! Código: ${codigoRastreio}`,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(
        JSON.stringify({ success: false, error: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email de rastreio enviado para ${email}:`, resendData.id);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-tracking-email error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao enviar email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
