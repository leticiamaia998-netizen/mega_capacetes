export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-admin-token, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

export function options() {
  return new Response("ok", { headers: corsHeaders });
}

export function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
