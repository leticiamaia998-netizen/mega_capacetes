// ============================================================
// SUPABASE EDGE FUNCTION: fb-purchase
// Envia evento Purchase ao Facebook CAPI (server-side)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orderId, valor, email, utm } = await req.json();

    const pixelId = Deno.env.get("FB_PIXEL_ID");
    const accessToken = Deno.env.get("FB_ACCESS_TOKEN");

    if (!pixelId || !accessToken) {
      console.warn("FB_PIXEL_ID ou FB_ACCESS_TOKEN não configurados");
      return new Response(JSON.stringify({ success: false, error: "FB não configurado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const hashedEmail = email ? await sha256(email) : undefined;

    const eventData = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime,
          action_source: "website",
          event_source_url: utm?.page_url || "https://megacapacetes.store",
          user_data: {
            em: hashedEmail ? [hashedEmail] : undefined,
            client_user_agent: utm?.user_agent,
            fbc: utm?.fbc,
            fbp: utm?.fbp,
          },
          custom_data: {
            currency: "BRL",
            value: valor,
            order_id: orderId,
          },
        },
      ],
      test_event_code: undefined, // Remover em produção ou adicionar código de teste
    };

    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData),
      }
    );

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      console.error("FB CAPI error:", fbData);
      return new Response(
        JSON.stringify({ success: false, error: fbData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ FB Purchase enviado para pedido ${orderId}:`, fbData);

    return new Response(
      JSON.stringify({ success: true, fbEvents: fbData.events_received }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("fb-purchase error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
