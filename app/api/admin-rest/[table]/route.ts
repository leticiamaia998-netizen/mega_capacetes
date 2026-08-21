import { requireAdmin } from "@/lib/store/admin-auth";
import { getEnv } from "@/lib/store/env";
import { json } from "@/lib/store/http";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "orders",
  "user_roles",
  "notifications",
  "payment_gateways",
  "price_overrides",
  "pix_errors",
  "rastreio_origem",
  "orders_status",
]);

type RouteProps = { params: Promise<{ table: string }> };

function restTarget(table: string, search: string) {
  const url = getEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase do admin não configurado");
  return {
    dest: `${url}/rest/v1/${table}${search}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

async function proxy(request: Request, table: string) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!ALLOWED.has(table)) return json({ error: "Tabela não permitida" }, 403);

  try {
    const incoming = new URL(request.url);
    const { dest, headers } = restTarget(table, incoming.search);
    for (const name of ["Prefer", "Accept", "Range", "Accept-Profile"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    if (!headers.Prefer) headers.Prefer = "return=representation";

    const res = await fetch(dest, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    });
    const out = new Headers();
    for (const name of ["content-type", "content-range", "preference-applied", "location"]) {
      const value = res.headers.get(name);
      if (value) out.set(name, value);
    }
    out.set("Access-Control-Allow-Origin", "*");
    out.set("Cache-Control", "no-store");
    return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro no admin" }, 500);
  }
}

export function OPTIONS() {
  return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, x-admin-token, prefer, accept, range, accept-profile",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    },
  });
}

export async function GET(request: Request, { params }: RouteProps) {
  return proxy(request, (await params).table);
}

export async function POST(request: Request, { params }: RouteProps) {
  return proxy(request, (await params).table);
}

export async function PATCH(request: Request, { params }: RouteProps) {
  return proxy(request, (await params).table);
}

export async function PUT(request: Request, { params }: RouteProps) {
  return proxy(request, (await params).table);
}

export async function DELETE(request: Request, { params }: RouteProps) {
  return proxy(request, (await params).table);
}
