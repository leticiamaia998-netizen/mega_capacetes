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

    // ── 1. Reutilizar PIX válido/tentativa recente ou criar pedido ────
    // Evita gerar outra cobrança quando o cliente atualiza a página ou
    // tenta novamente enquanto o PIX anterior ainda está válido.
    const nowIso = new Date().toISOString();
    const { data: activePixOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("email", customer.email)
      .eq("valor", amount)
      .eq("status", "pending")
      .gt("pix_expires_at", nowIso)
      .neq("pix_copy_paste", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let recentOrder = activePixOrder;
    if (!recentOrder) {
      const recentThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("email", customer.email)
        .eq("valor", amount)
        .eq("status", "pending")
        .gte("created_at", recentThreshold)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      recentOrder = data;
    }

    let order = recentOrder;
    let orderError = null;

    if (!order) {
      const result = await supabase.from("orders").insert({
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
        status: "pending",
        utm: utm ?? {},
        tracking: body.tracking ?? {},
        customer: {
          full_name: customer.name,
          email: customer.email,
          phone: customer.phone ?? "",
          cpf: customer.cpf ?? "",
        },
        gateway: { gateway_type: "pix", name: "IronPay" },
      })
      .select()
      .single();
      order = result.data;
      orderError = result.error;
    }

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

    const extractPix = (raw: Record<string, any>) => {
      const asObject = (value: unknown): Record<string, any> | null =>
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, any>
          : null;
      // A IronPay também usa `transaction` como um identificador textual.
      // Só tratamos data/transaction como payload quando forem objetos.
      const transaction = asObject(raw.data) || asObject(raw.transaction) || raw;
      const pix = asObject(transaction.pix) ||
        asObject(transaction.pix_data) ||
        asObject(transaction.payment) ||
        asObject(transaction.payment_data) ||
        transaction;
      return {
        qrCode: pix.qr_code_base64 || pix.qr_code_image || pix.qr_image || pix.qrcode || pix.qrCode || "",
        copyPaste: pix.pix_qr_code || pix.pix_copy_paste || pix.copy_paste || pix.pix_code || pix.pix_qrcode || pix.brcode || pix.emv || pix.qr_code || "",
        externalId: transaction.transaction_hash || transaction.hash || transaction.id || transaction.charge_id || transaction.transaction_id || order.id,
      };
    };

    if (order?.pix_copy_paste || order?.pix_qr_code) {
      return new Response(JSON.stringify({
        success: true,
        qrCode: order.pix_qr_code || "",
        copyPaste: order.pix_copy_paste || "",
        externalId: order.external_id || order.transaction_id || order.id,
        orderId: order.id,
        gatewayName: "ironpay",
        alreadyPaid: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!ironpayToken || !ironpayOfferHash || !ironpayProductHash) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais IronPay incompletas", orderId: order.id }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cachedIronpayResponse = order?.gateway?.response;
    if (cachedIronpayResponse) {
      const cachedPix = extractPix(cachedIronpayResponse);
      if (cachedPix.qrCode || cachedPix.copyPaste) {
        await supabase.from("orders").update({
          transaction_id: cachedPix.externalId,
          external_id: cachedPix.externalId,
          pix_qr_code: cachedPix.qrCode,
          pix_copy_paste: cachedPix.copyPaste,
          pix_error: null,
        }).eq("id", order.id);
        return new Response(JSON.stringify({
          success: true,
          ...cachedPix,
          orderId: order.id,
          gatewayName: "ironpay",
          alreadyPaid: false,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(
        JSON.stringify({ success: false, error: "Resposta PIX da IronPay ainda não reconhecida", orderId: order.id }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const ironpayRes = await fetch("https://api.ironpayapp.com.br/api/public/v1/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ironpayToken}`,
        },
        body: JSON.stringify({
          api_token: ironpayToken,
          offer_hash: ironpayOfferHash,
          product_hash: ironpayProductHash,
          amount: Math.round(amount * 100), // em centavos
          payment_method: "pix",
          installments: 1,
          cart: (Array.isArray(items) ? items : []).map((item: Record<string, any>) => ({
            offer_hash: ironpayOfferHash,
            product_hash: ironpayProductHash,
            quantity: Number(item.quantity) || 1,
            price: Math.round((Number(item.price) || amount) * 100),
            operation_type: 1,
            title: item.name || "Produto MegaCapacetes",
          })),
          customer: {
            name: customer.name,
            email: customer.email,
            document: customer.cpf?.replace(/\D/g, ""),
            phone_number: customer.phone?.replace(/\D/g, ""),
          },
          external_id: order.id,
          metadata: {
            order_id: order.id,
            items: items?.length ?? 1,
          },
        }),
      });

      const responseText = await ironpayRes.text();
      let ironpayData: Record<string, any> = {};
      try {
        ironpayData = responseText ? JSON.parse(responseText) : {};
      } catch {
        ironpayData = { message: responseText || `IronPay HTTP ${ironpayRes.status}` };
      }
      console.log("IronPay response:", JSON.stringify(ironpayData));

      if (ironpayRes.ok && ironpayData) {
        const extracted = extractPix(ironpayData);
        qrCode = extracted.qrCode;
        copyPaste = extracted.copyPaste;
        externalId = extracted.externalId;

        // Atualizar pedido com dados do PIX
        await supabase
          .from("orders")
          .update({
            status: "pending",
            transaction_id: externalId,
            external_id: externalId,
            pix_qr_code: qrCode,
            pix_copy_paste: copyPaste,
            pix_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min
            pix_error: null,
            gateway: { gateway_type: "pix", name: "IronPay", response: ironpayData },
          })
          .eq("id", order.id);

        if (!copyPaste && !qrCode) {
          pixError = "Resposta PIX da IronPay sem código reconhecido";
          await supabase.from("pix_errors").insert({
            order_id: order.id,
            error_message: pixError,
            error_details: ironpayData,
          });
        }

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
