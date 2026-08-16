// ============================================================
// SUPABASE EDGE FUNCTION: checkout-create-pix
// Cria pedido + gera PIX via IronPay
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { amount, customer, items, shippingAddress, utm } = body;

    // Validações básicas
    if (!amount || !customer?.name || !customer?.email) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase admin client (service role)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Criar pedido no banco ──────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        nome: customer.name,
        email: customer.email,
        telefone: customer.phone,
        cpf: customer.cpf,
        valor: amount,
        produtos: items,
        subtotal: body.subtotal ?? amount,
        desconto: body.totalDiscount ?? 0,
        frete: body.shippingCost ?? 0,
        metodo_envio: body.shippingMethod ?? "free",
        cep: shippingAddress?.cep,
        rua: shippingAddress?.address,
        numero: shippingAddress?.number,
        complemento: shippingAddress?.complement,
        bairro: shippingAddress?.neighborhood,
        cidade: shippingAddress?.city,
        estado: shippingAddress?.state,
        metodo_pagamento: "pix",
        status: "checkout_iniciado",
        utm: utm ?? {},
        tracking: body.tracking ?? {},
      })
      .select()
      .single();

    if (orderError) {
      console.error("DB error:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao criar pedido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Criar PIX na IronPay ───────────────────────────────
    const ironpayToken = Deno.env.get("IRONPAY_API_TOKEN");
    const ironpayOfferHash = Deno.env.get("IRONPAY_OFFER_HASH");
    const ironpayProductHash = Deno.env.get("IRONPAY_PRODUCT_HASH");

    let qrCode = "";
    let copyPaste = "";
    let externalId = "";
    let pixError = "";

    try {
      const ironpayRes = await fetch("https://api.ironpay.com.br/v1/pix/charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ironpayToken}`,
        },
        body: JSON.stringify({
          offer_hash: ironpayOfferHash,
          product_hash: ironpayProductHash,
          amount: Math.round(amount * 100), // em centavos
          customer: {
            name: customer.name,
            email: customer.email,
            cpf: customer.cpf?.replace(/\D/g, ""),
            phone: customer.phone?.replace(/\D/g, ""),
          },
          external_id: order.id,
          metadata: {
            order_id: order.id,
            items: items?.length ?? 1,
          },
        }),
      });

      const ironpayData = await ironpayRes.json();
      console.log("IronPay response:", JSON.stringify(ironpayData));

      if (ironpayRes.ok && ironpayData) {
        // IronPay retorna qr_code e copy_paste (verificar campo exato no seu plano)
        qrCode = ironpayData.qr_code_base64 || ironpayData.qr_code_image || ironpayData.qr_image || "";
        copyPaste = ironpayData.pix_copy_paste || ironpayData.copy_paste || ironpayData.brcode || ironpayData.emv || "";
        externalId = ironpayData.id || ironpayData.charge_id || ironpayData.transaction_id || order.id;

        // Atualizar pedido com dados do PIX
        await supabase
          .from("orders")
          .update({
            status: "pix_gerado",
            transaction_id: externalId,
            external_id: externalId,
            pix_qr_code: qrCode,
            pix_copy_paste: copyPaste,
            pix_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min
          })
          .eq("id", order.id);

      } else {
        pixError = ironpayData?.message || ironpayData?.error || "Erro IronPay";
        console.error("IronPay error:", pixError);

        // Log do erro
        await supabase.from("pix_errors").insert({
          order_id: order.id,
          error_message: pixError,
          error_details: ironpayData,
        });

        // Atualiza com erro mas mantém o order_id para o frontend
        await supabase
          .from("orders")
          .update({ pix_error: pixError })
          .eq("id", order.id);
      }
    } catch (e) {
      pixError = e instanceof Error ? e.message : "Erro ao conectar IronPay";
      console.error("IronPay exception:", pixError);

      await supabase.from("pix_errors").insert({
        order_id: order.id,
        error_message: pixError,
        error_details: { exception: String(e) },
      });
    }

    // ── 3. Notificação admin ──────────────────────────────────
    await supabase.from("notifications").insert({
      tipo: "novo_pedido",
      titulo: "Novo pedido PIX",
      mensagem: `${customer.name} - R$ ${amount.toFixed(2)}`,
      order_id: order.id,
    }).catch(() => {}); // não bloquear em caso de erro

    // ── 4. Retornar resultado ─────────────────────────────────
    if (!copyPaste && !qrCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: pixError || "Não foi possível gerar o PIX. Tente novamente.",
          orderId: order.id,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        qrCode,
        copyPaste,
        externalId,
        orderId: order.id,
        gatewayName: "ironpay",
        alreadyPaid: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
