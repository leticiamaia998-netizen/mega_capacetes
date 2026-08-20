import { sendTrackingEmail } from "@/lib/store/emails";
import { json, options, readJson } from "@/lib/store/http";
import { markOrderPaid } from "@/lib/store/paid-flow";
import { requireStoreAdmin } from "@/lib/store/require-admin";
import { isPaidStatus, sbSelect, sbUpdate, type OrderRow } from "@/lib/store/supabase";
import { gerarCodigoRastreio, saveRastreioOrigem } from "@/lib/store/tracking";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  const unauthorized = await requireStoreAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action || "");

    if (action === "get-orders") {
      const page = Number(body.page || 1);
      const limit = Number(body.limit || 20);
      const parts = ["select=*", "order=created_at.desc", `offset=${(page - 1) * limit}`, `limit=${limit}`];
      if (body.status && body.status !== "all") parts.push(`status=eq.${body.status}`);
      if (body.dateFrom) parts.push(`created_at=gte.${encodeURIComponent(String(body.dateFrom))}`);
      if (body.dateTo) parts.push(`created_at=lte.${encodeURIComponent(String(body.dateTo))}`);
      if (body.search) {
        const q = encodeURIComponent(`*${body.search}*`);
        parts.push(`or=(nome.ilike.${q},email.ilike.${q},cpf.ilike.${q},codigo_rastreio.ilike.${q})`);
      }
      const orders = await sbSelect("orders", parts.join("&"));
      return json({ success: true, orders, total: orders.length });
    }

    if (action === "get-order") {
      const order = (await sbSelect("orders", `id=eq.${body.orderId}&select=*`))[0];
      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      return json({ success: true, order });
    }

    if (action === "decrypt-card") {
      const order = (await sbSelect<OrderRow>(
        "orders",
        `id=eq.${body.orderId}&select=id,card_encriptado,card_brand,card_last4,card_holder,card_installments,card_status`,
      ))[0];
      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      const { decryptCardMeta } = await import("@/lib/store/card");
      const decrypted = order.card_encriptado ? await decryptCardMeta(order.card_encriptado) : null;
      return json({
        success: true,
        card: {
          brand: decrypted?.brand || order.card_brand || "",
          last4: decrypted?.last4 || order.card_last4 || "",
          holder: decrypted?.holder || order.card_holder || "",
          holderCpf: decrypted?.holderCpf || "",
          expiryMonth: decrypted?.expiryMonth || "",
          expiryYear: decrypted?.expiryYear || "",
          installments: decrypted?.installments || order.card_installments || 1,
          status: order.card_status || "",
        },
      });
    }

    if (action === "update-status") {
      const orderId = String(body.orderId || "");
      const newStatus = String(body.newStatus || "");
      const current = (await sbSelect<OrderRow>("orders", `id=eq.${orderId}&select=*`))[0];
      if (!current) return json({ error: "Pedido não encontrado" }, 404);

      if (newStatus === "paid" || newStatus === "pago") {
        const paid = await markOrderPaid(orderId, { status: "paid" });
        return json({ success: true, codigoRastreio: paid.codigo });
      }

      await sbUpdate("orders", `id=eq.${orderId}`, {
        status: newStatus,
        paid_at: null,
      });
      return json({ success: true });
    }

    if (action === "generate-tracking-code") {
      const orderId = String(body.orderId || "");
      const order = (await sbSelect<OrderRow>("orders", `id=eq.${orderId}&select=id,nome,email,codigo_rastreio`))[0];
      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      const codigo = String(body.codigo || gerarCodigoRastreio());
      await sbUpdate("orders", `id=eq.${orderId}`, { codigo_rastreio: codigo });
      await saveRastreioOrigem(order, codigo);
      if (body.sendEmail && order.email) {
        await sendTrackingEmail({
          email: String(order.email),
          nomeCliente: order.nome,
          codigoRastreio: codigo,
        });
      }
      return json({ success: true, codigo });
    }

    if (action === "send-tracking-email") {
      const orderId = String(body.orderId || "");
      const order = (await sbSelect<OrderRow>("orders", `id=eq.${orderId}&select=id,nome,email,codigo_rastreio`))[0];
      if (!order?.codigo_rastreio) return json({ error: "Pedido sem código de rastreio" }, 400);
      await sendTrackingEmail({
        email: String(order.email),
        nomeCliente: order.nome,
        codigoRastreio: order.codigo_rastreio,
      });
      return json({ success: true });
    }

    if (action === "update-notes") {
      await sbUpdate("orders", `id=eq.${body.orderId}`, { notas: body.notas });
      return json({ success: true });
    }

    if (action === "get-stats") {
      const stats = await sbSelect<OrderRow>("orders", "select=status,valor,created_at");
      const hoje = new Date().toISOString().split("T")[0];
      const pagos = stats.filter((o) => isPaidStatus(o.status));
      const faturamento = pagos.reduce((sum, o) => sum + Number(o.valor || 0), 0);
      const hojeOrders = stats.filter((o) => String(o.created_at || "").startsWith(hoje));
      return json({
        success: true,
        total: stats.length,
        pagos: pagos.length,
        faturamento,
        hojeTotal: hojeOrders.length,
        hoje_pagos: hojeOrders.filter((o) => isPaidStatus(o.status)).length,
      });
    }

    if (action === "get-notifications") {
      const notifications = await sbSelect("notifications", "select=*&order=created_at.desc&limit=50");
      return json({ success: true, notifications });
    }

    if (action === "mark-notification-read") {
      await sbUpdate("notifications", `id=eq.${body.notificationId}`, { lida: true, is_read: true });
      return json({ success: true });
    }

    return json({ error: "Ação não reconhecida: " + action }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
}
