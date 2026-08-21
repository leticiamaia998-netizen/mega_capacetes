"use client";

import { FormEvent, useEffect, useState } from "react";

const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_PANEL = "/xxx";

function b64url(value: object) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fakeJwt(email: string) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    aud: "authenticated",
    role: "authenticated",
    sub: ADMIN_USER_ID,
    email,
    iat: now,
    exp: now + 8 * 3600,
  })}.mcadmin`;
}

function saveAdminSession(token: string, username: string) {
  const email = username.includes("@") ? username : `${username}@admin.local`;
  const access = fakeJwt(email);
  const session = {
    access_token: access,
    refresh_token: "mc-admin-refresh",
    expires_in: 28800,
    expires_at: Math.floor(Date.now() / 1000) + 28800,
    token_type: "bearer",
    user: {
      id: ADMIN_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  };
  localStorage.setItem("mcAdminToken", token);
  localStorage.setItem("mcAdminUser", username);
  const keys = new Set([
    "sb-qjsjexpmkctyusukxwgm-auth-token",
    "sb-qjsexpmkctyusukxwgm-auth-token",
    ...Object.keys(localStorage).filter((key) => key.includes("auth-token")),
  ]);
  for (const key of keys) localStorage.setItem(key, JSON.stringify(session));
}

export default function LoginForm() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("mcAdminToken");
    if (!token) return;
    void fetch("/api/admin-verify", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data?.valid || data?.success) window.location.replace(ADMIN_PANEL);
        else localStorage.removeItem("mcAdminToken");
      })
      .catch(() => {});
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const username = String(form.get("user") || user).trim();
    const password = String(form.get("pass") || pass);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username, pass: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        throw new Error(data.error || "Usuário ou senha inválidos");
      }
      saveAdminSession(data.token, username);
      window.location.replace(ADMIN_PANEL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        width: "100%",
        maxWidth: 380,
        background: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 16,
        padding: 28,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.4, color: "#a1a1aa", fontWeight: 700 }}>MEGACAPACETES</p>
      <h1 style={{ margin: "8px 0 20px", fontSize: 24 }}>Painel admin</h1>
      <p style={{ margin: "0 0 18px", color: "#a1a1aa", fontSize: 13 }}>
        Use o usuário e a senha configurados no Cloudflare (ADMIN_USER / ADMIN_PASS).
      </p>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Usuário</label>
      <input
        name="user"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        autoComplete="username"
        required
        style={{
          width: "100%",
          height: 44,
          borderRadius: 10,
          border: "1px solid #3f3f46",
          background: "#09090b",
          color: "#fff",
          padding: "0 12px",
          marginBottom: 14,
          boxSizing: "border-box",
        }}
      />
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Senha</label>
      <input
        name="pass"
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        autoComplete="current-password"
        required
        style={{
          width: "100%",
          height: 44,
          borderRadius: 10,
          border: "1px solid #3f3f46",
          background: "#09090b",
          color: "#fff",
          padding: "0 12px",
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />
      {error ? <p style={{ color: "#fca5a5", fontSize: 13, margin: "0 0 12px" }}>{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          height: 46,
          border: 0,
          borderRadius: 10,
          background: "#fff",
          color: "#09090b",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
