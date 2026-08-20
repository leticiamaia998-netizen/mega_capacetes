import { getEnv } from "./env";
import { sbSelect, sbUpdate } from "./supabase";

export type GatewayRow = {
  id: string;
  code?: string | null;
  name?: string | null;
  nome?: string | null;
  method?: string | null;
  gateway_type?: string | null;
  enabled?: boolean | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
};

export function gatewayCode(row: GatewayRow) {
  return String(row.code || row.name || row.nome || row.id || "").toLowerCase();
}

export function gatewayMethod(row: GatewayRow): "pix" | "card" {
  const value = String(row.method || row.gateway_type || "pix").toLowerCase();
  return value === "card" || value === "credit_card" || value === "cartao" ? "card" : "pix";
}

export function gatewayEnabled(row: GatewayRow) {
  return Boolean(row.enabled ?? row.is_active);
}

export async function listGateways() {
  return sbSelect<GatewayRow>(
    "payment_gateways",
    "select=id,code,name,nome,method,gateway_type,enabled,is_active,is_default,updated_at,created_at&order=created_at.asc",
  );
}

export function credentialsFor(code: string) {
  switch (code) {
    case "ironpay":
      return Boolean(getEnv("IRONPAY_API_TOKEN") && getEnv("IRONPAY_OFFER_HASH") && getEnv("IRONPAY_PRODUCT_HASH"));
    case "masterfy":
      return Boolean(getEnv("MASTERFY_API_KEY"));
    case "umbrellapag":
      return Boolean(getEnv("UMBRELLAPAG_API_KEY"));
    case "venuspay":
    case "venuspay_pix":
      return Boolean(getEnv("VENUS_PAY_SECRET_KEY"));
    default:
      return false;
  }
}

export async function activePixGateway() {
  try {
    const rows = await listGateways();
    const pix = rows.filter((row) => gatewayMethod(row) === "pix" && gatewayEnabled(row));
    const preferred = pix.find((row) => credentialsFor(gatewayCode(row))) ?? pix[0];
    if (preferred) return preferred;
  } catch (error) {
    console.error("payment_gateways", error);
  }
  if (credentialsFor("ironpay")) {
    return { id: "ironpay", code: "ironpay", name: "IronPay", method: "pix", enabled: true, is_active: true };
  }
  return null;
}

export async function cardGatewayEnabled() {
  try {
    const rows = await listGateways();
    const card = rows.find((row) => gatewayMethod(row) === "card");
    if (card) return gatewayEnabled(card) && credentialsFor("venuspay");
  } catch (error) {
    console.error("payment_gateways", error);
  }
  return credentialsFor("venuspay");
}

export async function setGatewayEnabled(id: string, enabled: boolean) {
  const rows = await sbSelect<GatewayRow>("payment_gateways", `id=eq.${id}&select=*`);
  const current = rows[0];
  if (!current) throw new Error("Gateway não encontrado");

  if (enabled && gatewayMethod(current) === "pix") {
    const all = await listGateways();
    for (const row of all) {
      if (gatewayMethod(row) === "pix" && row.id !== id && gatewayEnabled(row)) {
        await sbUpdate("payment_gateways", `id=eq.${row.id}`, {
          enabled: false,
          is_active: false,
          ativo: false,
        });
      }
    }
  }

  await sbUpdate("payment_gateways", `id=eq.${id}`, {
    enabled,
    is_active: enabled,
    ativo: enabled,
  });

  return listGateways();
}

export function publicGatewayList(rows: GatewayRow[]) {
  return rows.map((row) => {
    const code = gatewayCode(row);
    return {
      id: row.id,
      code,
      name: row.name || row.nome || code,
      method: gatewayMethod(row),
      enabled: gatewayEnabled(row),
      configured: credentialsFor(code),
      is_default: Boolean(row.is_default),
    };
  });
}
