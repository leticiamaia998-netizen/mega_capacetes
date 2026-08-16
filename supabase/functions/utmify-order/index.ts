// ============================================================
// SUPABASE EDGE FUNCTION: utmify-order
// Envia pedido confirmado para a UTMify
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orderId, valor, email, nome, produtos, utm } = await req.json();

    const utmifyToken = Deno.env.get("UTMIFY_API_TOKEN");

    if (!utmifyToken) {
      console.warn("UTMIFY_API_TOKEN não configurado");
      return new Response(
        JSON.stringify({ success: false, error: "UTMify não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Montar payload UTMify
    const items = Array.isArray(produtos)
      ? produtos.map((p: { name?: string; quantity?: number; price?: number }) => ({
          name: p.name || "Produto",
          quantity: p.quantity || 1,
          price: p.price || 0,
        }))
      : [{ name: "Pedido", quantity: 1, price: valor }];

    const payload = {
      order_id: orderId,
      total: valor,
      currency: "BRL",
      payment_method: "pix",
      status: "paid",
      customer: {
        name: nome,
        email,
      },
      items,
      utm_source: utm?.utm_source,
      utm_medium: utm?.utm_medium,
      utm_campaign: utm?.utm_campaign,
      utm_term: utm?.utm_term,
      utm_content: utm?.utm_content,
    };

    const utmRes = await fetch("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": utmifyToken,
      },
      body: JSON.stringify(payload),
    });

    const utmData = await utmRes.json();

    if (!utmRes.ok) {
      console.error("UTMify error:", utmData);
      return new Response(
        JSON.stringify({ success: false, error: utmData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ UTMify: pedido ${orderId} enviado`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("utmify-order error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
