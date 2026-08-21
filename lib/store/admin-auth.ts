import { getEnv } from "./env";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function toBase64Url(bytes: ArrayBuffer | Uint8Array | string) {
  const buffer =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
  let binary = "";
  buffer.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sessionSecret() {
  const configured = getEnv("ADMIN_SESSION_SECRET");
  if (configured.length >= 16) return configured;
  const user = getEnv("ADMIN_USER");
  const pass = getEnv("ADMIN_PASS");
  return `mc-admin-fallback:${user}:${pass}`.padEnd(32, "0");
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

export async function createAdminToken() {
  const payload = toBase64Url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS, sub: "admin" }));
  return `${payload}.${await sign(payload)}`;
}

export async function verifyAdminToken(token?: string | null) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = await sign(payload);
  if (expected !== signature) return false;
  try {
    const json = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { exp?: number };
    return typeof json.exp === "number" && json.exp > Date.now();
  } catch {
    return false;
  }
}

export function readBearer(request: Request) {
  const header = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-admin-token");
}

function clean(value: string) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function adminCredentialsOk(user: string, pass: string) {
  const expectedUser = clean(getEnv("ADMIN_USER"));
  const expectedPass = clean(getEnv("ADMIN_PASS"));
  const gotUser = clean(user);
  const gotPass = clean(pass);
  return (
    expectedUser.length > 0 &&
    expectedPass.length > 0 &&
    gotUser.toLowerCase() === expectedUser.toLowerCase() &&
    gotPass === expectedPass
  );
}

export function adminEnvConfigured() {
  return Boolean(getEnv("ADMIN_USER") && getEnv("ADMIN_PASS"));
}

export async function requireAdmin(request: Request) {
  const ok = await verifyAdminToken(readBearer(request));
  if (!ok) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
