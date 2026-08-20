import { requireAdmin } from "@/lib/store/admin-auth";
import { listGateways, publicGatewayList, setGatewayEnabled } from "@/lib/store/gateways";
import { json, options, readJson } from "@/lib/store/http";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const rows = await listGateways();
  return json({ success: true, gateways: publicGatewayList(rows) });
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const body = await readJson<{ id?: string; enabled?: boolean }>(request);
  if (!body.id || typeof body.enabled !== "boolean") {
    return json({ success: false, error: "id e enabled são obrigatórios" }, 400);
  }
  const rows = await setGatewayEnabled(body.id, body.enabled);
  return json({ success: true, gateways: publicGatewayList(rows) });
}
