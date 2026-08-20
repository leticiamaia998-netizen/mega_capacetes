import { sendRecoveryEmail } from "@/lib/store/emails";
import { getEnv } from "@/lib/store/env";
import { json, options } from "@/lib/store/http";
import { isPaidStatus, sbSelect, sbUpdate, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

const DELAYS_MS = [30 * 60 * 1000, 4 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

export async function POST(request: Request) {
  const secret = getEnv("CRON_SECRET");
  const provided = request.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return json({ error: "Não autorizado" }, 401);
  }

  const now = encodeURIComponent(new Date().toISOString());
  const rows = await sbSelect<OrderRow>(
    "orders",
    `recovery_next_at=lte.${now}&recovery_count=lt.3&status=eq.pending&select=id,nome,email,valor,status,status_detalhe,recovery_count,recovery_next_at&limit=40`,
  );

  const sent: string[] = [];
  for (const order of rows) {
    if (isPaidStatus(order.status) || !order.email) continue;
    try {
      await sendRecoveryEmail(order);
      const count = Number(order.recovery_count || 0) + 1;
      const nextDelay = DELAYS_MS[Math.min(count, DELAYS_MS.length - 1)];
      await sbUpdate("orders", `id=eq.${order.id}`, {
        recovery_count: count,
        recovery_next_at: count >= 3 ? null : new Date(Date.now() + nextDelay).toISOString(),
      });
      sent.push(order.id);
    } catch (error) {
      console.error("recovery", order.id, error);
    }
  }

  return json({ success: true, processed: rows.length, sent: sent.length, ids: sent });
}
