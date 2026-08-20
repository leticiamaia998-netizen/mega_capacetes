import { getEnv } from "./env";
import { readBearer, verifyAdminToken } from "./admin-auth";
import { sbSelect } from "./supabase";

export async function requireStoreAdmin(request: Request) {
  if (await verifyAdminToken(readBearer(request))) return null;

  const token = readBearer(request);
  if (!token) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const url = getEnv("SUPABASE_URL").replace(/\/$/, "");
  const anon = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) {
    return new Response(JSON.stringify({ error: "Auth do admin não configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  const user = (await userRes.json()) as { id?: string };
  if (!user.id) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const roles = await sbSelect<{ role: string }>(
    "user_roles",
    `user_id=eq.${user.id}&role=eq.admin&select=role`,
  );
  if (!roles[0]) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  return null;
}
