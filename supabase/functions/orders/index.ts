// ============================================================
// SUPABASE EDGE FUNCTION: orders
// Consultas públicas de pedidos (status, rastreio)
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

    // ── RASTREAR PEDIDO ───────────────────────────────────────
    if (action === "rastrear") {
      const { codigo } = body;

      if (!codigo) {
        return new Response(
          JSON.stringify({ success: false, error: "Código de rastreio obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar origem do rastreio
      const { data: origem } = await supabase
        .from("rastreio_origem")
        .select("*, order_id")
        .eq("codigo", codigo.toUpperCase())
        .single();

      if (!origem) {
        return new Response(
          JSON.stringify({ success: false, error: "Código de rastreio não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar endereço do pedido
      let endereco = null;
      if (origem.order_id) {
        const { data: order } = await supabase
          .from("orders")
          .select("cidade, estado, cep, rua, numero, nome")
          .eq("id", origem.order_id)
          .single();
        endereco = order;
      }

      // Gerar timeline fake baseada em origem_at
      const origemDate = new Date(origem.origem_at);
      const timeline = gerarTimeline(origemDate);

      return new Response(
        JSON.stringify({
          success: true,
          codigo: origem.codigo,
          nome_cliente: origem.nome_cliente ?? endereco?.nome,
          origem_at: origem.origem_at,
          endereco,
          timeline,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STATUS DO PEDIDO ──────────────────────────────────────
    if (action === "get-status") {
      const { orderId } = body;

      const { data, error } = await supabase
        .from("orders_status")
        .select("id, status, updated_at")
        .eq("id", orderId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: "Pedido não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true, ...data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Orders function error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Timeline fake baseada na data de origem ───────────────────
function gerarTimeline(origemDate: Date) {
  const add = (d: Date, hours: number) =>
    new Date(d.getTime() + hours * 3_600_000).toISOString();

  return [
    {
      etapa: "Pedido postado",
      descricao: "Seu pedido foi postado nos Correios",
      data: add(origemDate, 0),
      concluido: true,
    },
    {
      etapa: "Em trânsito",
      descricao: "Objeto encaminhado para a unidade de distribuição",
      data: add(origemDate, 24),
      concluido: new Date() > new Date(add(origemDate, 24)),
    },
    {
      etapa: "Hub regional",
      descricao: "Chegou no centro de distribuição regional",
      data: add(origemDate, 72),
      concluido: new Date() > new Date(add(origemDate, 72)),
    },
    {
      etapa: "Saiu para entrega",
      descricao: "Objeto saiu para entrega ao destinatário",
      data: add(origemDate, 144),
      concluido: new Date() > new Date(add(origemDate, 144)),
    },
    {
      etapa: "Entregue",
      descricao: "Objeto entregue ao destinatário",
      data: add(origemDate, 168),
      concluido: new Date() > new Date(add(origemDate, 168)),
    },
  ];
}
