import { cardGatewayEnabled, listGateways, publicGatewayList } from "@/lib/store/gateways";
import { json, options } from "@/lib/store/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function GET() {
  try {
    const rows = await listGateways();
    return json({
      success: true,
      cardEnabled: await cardGatewayEnabled(),
      gateways: publicGatewayList(rows),
    });
  } catch {
    const { getEnv } = await import("@/lib/store/env");
    return json({
      success: true,
      cardEnabled: Boolean(getEnv("VENUS_PAY_SECRET_KEY")),
      gateways: [],
    });
  }
}
