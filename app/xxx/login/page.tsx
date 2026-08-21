"use client";

import { FormEvent, useEffect, useState } from "react";

function saveAdminSession(token: string, username: string) {
  localStorage.setItem("mcAdminToken", token);
  localStorage.setItem("mcAdminUser", username);
}

export default function AdminLoginPage() {
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
        if (data?.valid || data?.success) window.location.replace("/xxx");
        else localStorage.removeItem("mcAdminToken");
      })
      .catch(() => {});
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user.trim(), pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        throw new Error(data.error || "Usuário ou senha inválidos");
      }
      saveAdminSession(data.token, user.trim());
      window.location.replace("/xxx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#fff", display: "grid", placeItems: "center", padding: 20, fontFamily: "system-ui, Segoe UI, Arial, sans-serif" }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 380, background: "#18181b", border: "1px solid #27272a", borderRadius: 16, padding: 28 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.4, color: "#a1a1aa", fontWeight: 700 }}>MEGACAPACETES</p>
        <h1 style={{ margin: "8px 0 20px", fontSize: 24 }}>Painel admin</h1>
        <p style={{ margin: "0 0 18px", color: "#a1a1aa", fontSize: 13 }}>Use o usuário e a senha configurados no Cloudflare (ADMIN_USER / ADMIN_PASS).</p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Usuário</label>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="username"
          required
          style={{ width: "100%", height: 44, borderRadius: 10, border: "1px solid #3f3f46", background: "#09090b", color: "#fff", padding: "0 12px", marginBottom: 14, boxSizing: "border-box" }}
        />
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Senha</label>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="current-password"
          required
          style={{ width: "100%", height: 44, borderRadius: 10, border: "1px solid #3f3f46", background: "#09090b", color: "#fff", padding: "0 12px", marginBottom: 16, boxSizing: "border-box" }}
        />
        {error ? <p style={{ color: "#fca5a5", fontSize: 13, margin: "0 0 12px" }}>{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", height: 46, border: 0, borderRadius: 10, background: "#fff", color: "#09090b", fontWeight: 800, cursor: "pointer" }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
