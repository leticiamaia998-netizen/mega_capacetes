import { getEnv } from "./env";

const restHeaders = (extra?: Record<string, string>) => {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
  }
  return {
    url: url.replace(/\/$/, ""),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extra,
    },
  };
};

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return [] as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Supabase HTTP ${res.status}`);
  }
}

function missingColumn(message: string) {
  return message.match(/Could not find the '([^']+)' column/i)?.[1] || null;
}

async function withUnknownColumnRetry<T>(
  row: Record<string, unknown>,
  send: (next: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  let current = { ...row };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await send(current);
    } catch (error) {
      const column = missingColumn(error instanceof Error ? error.message : String(error));
      if (!column || !(column in current)) throw error;
      const { [column]: _dropped, ...rest } = current;
      current = rest;
    }
  }
  return send(current);
}

export async function sbSelect<T = Record<string, unknown>>(
  table: string,
  query: string,
): Promise<T[]> {
  const { url, headers } = restHeaders();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const data = await parse<T[] | T>(res);
  return Array.isArray(data) ? data : [data];
}

export async function sbInsert<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  return withUnknownColumnRetry(row, async (next) => {
    const { url, headers } = restHeaders();
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await parse<T[] | T>(res);
    return Array.isArray(data) ? data[0] : data;
  });
}

export async function sbUpdate<T = Record<string, unknown>>(
  table: string,
  query: string,
  row: Record<string, unknown>,
): Promise<T[]> {
  return withUnknownColumnRetry(row, async (next) => {
    const { url, headers } = restHeaders();
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await parse<T[] | T>(res);
    return Array.isArray(data) ? data : [data];
  });
}

export async function sbUpsert<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<T> {
  return withUnknownColumnRetry(row, async (next) => {
    const { url, headers } = restHeaders({
      Prefer: "return=representation,resolution=merge-duplicates",
    });
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers,
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await parse<T[] | T>(res);
    return Array.isArray(data) ? data[0] : data;
  });
}

export type OrderRow = {
  id: string;
  created_at?: string;
  updated_at?: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  valor?: number | null;
  produtos?: unknown;
  status?: string | null;
  status_detalhe?: string | null;
  metodo_pagamento?: string | null;
  transaction_id?: string | null;
  external_id?: string | null;
  codigo_rastreio?: string | null;
  purchase_sent?: boolean | null;
  utmify_sent?: boolean | null;
  utm?: Record<string, unknown> | null;
  tracking?: Record<string, unknown> | null;
  gateway?: Record<string, unknown> | string | null;
  gateway_id?: string | null;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  pix_expires_at?: string | null;
  pix_error?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  recovery_count?: number | null;
  recovery_next_at?: string | null;
  card_encriptado?: string | null;
  card_erro?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  card_holder?: string | null;
  card_installments?: number | null;
  card_status?: string | null;
  paid_at?: string | null;
  ga_client_id?: string | null;
};

export function isPaidStatus(status?: string | null) {
  return ["paid", "pago", "approved", "aprovado"].includes(String(status || "").toLowerCase());
}
