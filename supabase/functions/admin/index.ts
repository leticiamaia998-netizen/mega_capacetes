// ============================================================
// SUPABASE EDGE FUNCTION: admin
// Painel administrativo — todas as operações do admin
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRACKING_PREFIX = "MC"; // Prefixo MegaCapacetes

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

  // Verificar autenticação admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  ).auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verificar se é admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .single();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── GET ORDERS (listagem com filtros) ─────────────────────
    if (action === "get-orders") {
      const {
        page = 1,
        limit = 20,
        status,
        search,
        dateFrom,
        dateTo,
      } = body;

      let query = supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      if (search) {
        query = query.or(
          `nome.ilike.%${search}%,email.ilike.%${search}%,cpf.ilike.%${search}%,codigo_rastreio.ilike.%${search}%`
        );
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, orders: data, total: count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET ORDER (detalhes de um pedido) ─────────────────────
    if (action === "get-order") {
      const { orderId } = body;
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, order: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE STATUS ─────────────────────────────────────────
    if (action === "update-status") {
      const { orderId, newStatus } = body;

      // Buscar pedido atual ANTES de atualizar (regra crítica do Supabase)
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("id, nome, email, codigo_rastreio, purchase_sent, valor, produtos, utm")
        .eq("id", orderId)
        .single();

      if (!currentOrder) {
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Atualizar por ID (nunca usar .update() com .limit() no Supabase!)
      const updateData: Record<string, unknown> = { status: newStatus };

      // Se marcando como pago, gerar código de rastreio automático
      const isPaid = newStatus === "paid" || newStatus === "pago";
      updateData.paid_at = isPaid ? new Date().toISOString() : null;

      if (isPaid && !currentOrder.codigo_rastreio) {
        const codigo = gerarCodigoRastreio();
        updateData.codigo_rastreio = codigo;

        // Salvar em rastreio_origem
        const { error: trackingError } = await supabase.from("rastreio_origem").insert({
          codigo,
          nome_cliente: currentOrder.nome,
          order_id: orderId,
        });
        if (trackingError) throw trackingError;

        // Enviar email de rastreio automaticamente
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-tracking-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              orderId,
              codigoRastreio: codigo,
              nomeCliente: currentOrder.nome,
              email: currentOrder.email,
            }),
          });
        } catch (e) {
          console.error("Erro ao enviar email rastreio:", e);
        }

        // Enviar FB Purchase (se ainda não enviou)
        if (!currentOrder.purchase_sent) {
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fb-purchase`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                orderId,
                valor: currentOrder.valor,
                email: currentOrder.email,
                utm: currentOrder.utm,
              }),
            });
            updateData.purchase_sent = true;
          } catch (e) {
            console.error("Erro FB Purchase:", e);
          }
        }

        // Enviar UTMify
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/utmify-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              orderId,
              valor: currentOrder.valor,
              email: currentOrder.email,
              nome: currentOrder.nome,
              produtos: currentOrder.produtos,
              utm: currentOrder.utm,
            }),
          });
        } catch (e) {
          console.error("Erro UTMify:", e);
        }
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);
      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, codigoRastreio: updateData.codigo_rastreio }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GENERATE TRACKING CODE ────────────────────────────────
    if (action === "generate-tracking-code") {
      const { orderId } = body;

      const { data: order } = await supabase
        .from("orders")
        .select("id, nome, email, codigo_rastreio")
        .eq("id", orderId)
        .single();

      if (!order) {
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const codigo = body.codigo || gerarCodigoRastreio();

      // Salvar código no pedido
      await supabase
        .from("orders")
        .update({ codigo_rastreio: codigo })
        .eq("id", orderId);

      // Salvar/atualizar rastreio_origem
      await supabase.from("rastreio_origem").upsert({
        codigo,
        nome_cliente: order.nome,
        order_id: orderId,
      }, { onConflict: "codigo" });

      return new Response(
        JSON.stringify({ success: true, codigo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SEND TRACKING EMAIL ───────────────────────────────────
    if (action === "send-tracking-email") {
      const { orderId } = body;

      const { data: order } = await supabase
        .from("orders")
        .select("id, nome, email, codigo_rastreio")
        .eq("id", orderId)
        .single();

      if (!order || !order.codigo_rastreio) {
        return new Response(
          JSON.stringify({ error: "Pedido sem código de rastreio" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-tracking-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            codigoRastreio: order.codigo_rastreio,
            nomeCliente: order.nome,
            email: order.email,
          }),
        }
      );

      const result = await res.json();
      return new Response(JSON.stringify({ success: res.ok, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE NOTES ──────────────────────────────────────────
    if (action === "update-notes") {
      const { orderId, notas } = body;
      await supabase.from("orders").update({ notas }).eq("id", orderId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET STATS (dashboard summary) ────────────────────────
    if (action === "get-stats") {
      const { data: stats } = await supabase
        .from("orders")
        .select("status, valor, created_at");

      const hoje = new Date().toISOString().split("T")[0];
      const total = stats?.length ?? 0;
      const pagos = stats?.filter((o) => o.status === "pago") ?? [];
      const faturamento = pagos.reduce((sum, o) => sum + (o.valor ?? 0), 0);
      const hojeOrders = stats?.filter(
        (o) => o.created_at?.startsWith(hoje)
      ) ?? [];

      return new Response(
        JSON.stringify({
          success: true,
          total,
          pagos: pagos.length,
          faturamento,
          hojeTotal: hojeOrders.length,
          hoje_pagos: hojeOrders.filter((o) => o.status === "pago").length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GET NOTIFICATIONS ─────────────────────────────────────
    if (action === "get-notifications") {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, notifications: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MARK NOTIFICATION READ ────────────────────────────────
    if (action === "mark-notification-read") {
      const { notificationId } = body;
      await supabase
        .from("notifications")
        .update({ lida: true })
        .eq("id", notificationId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Admin function error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
