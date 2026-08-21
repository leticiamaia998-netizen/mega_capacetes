"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";

type Order = {
  id: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  valor?: number | null;
  status?: string | null;
  status_detalhe?: string | null;
  metodo_pagamento?: string | null;
  gateway_id?: string | null;
  codigo_rastreio?: string | null;
  created_at?: string | null;
  cidade?: string | null;
  estado?: string | null;
  card_last4?: string | null;
  card_status?: string | null;
};

type Gateway = {
  id: string;
  name: string;
  method: string;
  enabled: boolean;
  configured: boolean;
};

type Stats = {
  total: number;
  pagos: number;
  faturamento: number;
  hojeTotal: number;
};

function token() {
  return localStorage.getItem("mcAdminToken") || "";
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status?: string | null) {
  const value = String(status || "").toLowerCase();
  if (["paid", "pago", "approved"].includes(value)) return "Pago";
  if (["cancelled", "canceled", "cancelado"].includes(value)) return "Cancelado";
  if (["refunded", "reembolsado"].includes(value)) return "Reembolsado";
  if (["cartao_recusado"].includes(value)) return "Cartão recusado";
  if (["pix_gerado", "pending"].includes(value)) return "Aguardando";
  return status || "Pendente";
}

async function adminPost(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("mcAdminToken");
    window.location.replace("/xxx/login");
    throw new Error("Sessão expirada");
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Falha na operação");
  }
  return data;
}

export function AdminClient() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"pedidos" | "gateways">("pedidos");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const current = token();
    if (!current) {
      window.location.replace("/xxx/login");
      return;
    }
    void fetch("/api/admin-verify", { headers: { Authorization: `Bearer ${current}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.valid && !data?.success) {
          localStorage.removeItem("mcAdminToken");
          window.location.replace("/xxx/login");
          return;
        }
        setReady(true);
      })
      .catch(() => window.location.replace("/xxx/login"));
  }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const ordersRes = await adminPost("get-orders", { page: 1, limit: 50, search });
      setOrders(ordersRes.orders || []);
      try {
        const statsRes = await adminPost("get-stats");
        setStats(statsRes);
      } catch {
        setStats(null);
      }
      try {
        const gatewaysRes = await fetch("/api/admin-gateways", { headers: { Authorization: `Bearer ${token()}` } }).then((res) => res.json());
        setGateways(gatewaysRes.gateways || []);
      } catch {
        setGateways([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao carregar o painel");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  const userName = useMemo(() => {
    try {
      return localStorage.getItem("mcAdminUser") || "admin";
    } catch {
      return "admin";
    }
  }, [ready]);

  async function markPaid(order: Order) {
    setMessage("Marcando como pago...");
    try {
      const data = await adminPost("update-status", { orderId: order.id, newStatus: "pago" });
      setMessage(data.codigoRastreio ? `Pago. Rastreio: ${data.codigoRastreio}` : "Pedido marcado como pago.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível marcar como pago");
    }
  }

  async function generateTracking(order: Order) {
    setMessage("Gerando rastreio...");
    try {
      const data = await adminPost("generate-tracking-code", { orderId: order.id, sendEmail: true });
      setMessage(`Código ${data.codigo} gerado e e-mail disparado.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o rastreio");
    }
  }

  async function toggleGateway(gateway: Gateway) {
    setMessage("Atualizando gateway...");
    try {
      const res = await fetch("/api/admin-gateways", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ id: gateway.id, enabled: !gateway.enabled }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Falha ao atualizar gateway");
      setGateways(data.gateways || []);
      setMessage(gateway.enabled ? `${gateway.name} desativado.` : `${gateway.name} ativado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o gateway");
    }
  }

  function logout() {
    localStorage.removeItem("mcAdminToken");
    localStorage.removeItem("mcAdminUser");
    window.location.replace("/xxx/login");
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090b", color: "#a1a1aa", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
        Verificando sessão...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#fff", fontFamily: "system-ui, Segoe UI, Arial, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "18px 24px", borderBottom: "1px solid #27272a" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#a1a1aa", letterSpacing: 1.4, fontWeight: 700 }}>MEGACAPACETES</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>Painel administrativo</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "#a1a1aa", fontSize: 13 }}>{userName}</span>
          <button type="button" onClick={logout} style={{ height: 36, padding: "0 14px", border: "1px solid #3f3f46", borderRadius: 8, background: "transparent", color: "#fff", cursor: "pointer" }}>
            Sair
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Stat label="Pedidos" value={String(stats?.total ?? "—")} />
          <Stat label="Pagos" value={String(stats?.pagos ?? "—")} />
          <Stat label="Hoje" value={String(stats?.hojeTotal ?? "—")} />
          <Stat label="Faturamento" value={stats ? money(Number(stats.faturamento || 0)) : "—"} />
        </section>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Tab active={tab === "pedidos"} onClick={() => setTab("pedidos")}>Pedidos</Tab>
          <Tab active={tab === "gateways"} onClick={() => setTab("gateways")}>Gateways</Tab>
        </div>

        {message ? <p style={{ color: "#fde68a", fontSize: 13 }}>{message}</p> : null}

        {tab === "pedidos" ? (
          <section>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
              style={{ display: "flex", gap: 8, marginBottom: 16 }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, e-mail, CPF ou rastreio"
                style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid #3f3f46", background: "#18181b", color: "#fff", padding: "0 12px" }}
              />
              <button type="submit" style={{ height: 42, padding: "0 16px", border: 0, borderRadius: 10, background: "#fff", color: "#09090b", fontWeight: 800, cursor: "pointer" }}>
                {loading ? "..." : "Buscar"}
              </button>
            </form>

            <div style={{ overflowX: "auto", border: "1px solid #27272a", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#18181b", textAlign: "left" }}>
                    {["Cliente", "Contato", "Valor", "Status", "Gateway", "Rastreio", "Data"].map((col) => (
                      <th key={col} style={{ padding: "12px 10px", color: "#a1a1aa", fontWeight: 600 }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.length ? orders.map((order) => (
                    <tr key={order.id} onClick={() => setSelected(order)} style={{ borderTop: "1px solid #27272a", cursor: "pointer" }}>
                      <td style={{ padding: "12px 10px" }}>{order.nome || "—"}</td>
                      <td style={{ padding: "12px 10px" }}>{order.email || order.telefone || "—"}</td>
                      <td style={{ padding: "12px 10px" }}>{money(Number(order.valor || 0))}</td>
                      <td style={{ padding: "12px 10px" }}>{statusLabel(order.status_detalhe || order.status)}</td>
                      <td style={{ padding: "12px 10px" }}>{order.gateway_id || order.metodo_pagamento || "—"}</td>
                      <td style={{ padding: "12px 10px", fontFamily: "monospace" }}>{order.codigo_rastreio || "—"}</td>
                      <td style={{ padding: "12px 10px" }}>{order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "—"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#a1a1aa" }}>
                        {loading ? "Carregando pedidos..." : "Nenhum pedido encontrado"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section style={{ display: "grid", gap: 10 }}>
            {gateways.length ? gateways.map((gateway) => (
              <div key={gateway.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 16 }}>
                <div>
                  <strong>{gateway.name}</strong>
                  <p style={{ margin: "4px 0 0", color: "#a1a1aa", fontSize: 13 }}>
                    {gateway.method.toUpperCase()} · {gateway.configured ? "credencial ok" : "sem credencial no Cloudflare"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleGateway(gateway)}
                  style={{ height: 36, padding: "0 14px", border: 0, borderRadius: 8, background: gateway.enabled ? "#16a34a" : "#3f3f46", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  {gateway.enabled ? "Ativo" : "Off"}
                </button>
              </div>
            )) : <p style={{ color: "#a1a1aa" }}>{loading ? "Carregando..." : "Nenhum gateway cadastrado."}</p>}
          </section>
        )}
      </main>

      {selected ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "grid", placeItems: "center", padding: 16 }} onClick={() => setSelected(null)}>
          <div style={{ width: "100%", maxWidth: 460, background: "#18181b", border: "1px solid #27272a", borderRadius: 16, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{selected.nome || "Pedido"}</h2>
            <p style={{ color: "#a1a1aa", fontSize: 13, lineHeight: 1.6 }}>
              {selected.email}<br />
              {selected.telefone}<br />
              {selected.cpf}<br />
              {selected.cidade}{selected.estado ? ` / ${selected.estado}` : ""}<br />
              {money(Number(selected.valor || 0))} · {statusLabel(selected.status)}<br />
              Rastreio: {selected.codigo_rastreio || "ainda não gerado"}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <button type="button" onClick={() => void markPaid(selected)} style={actionBtn}>Marcar como pago</button>
              <button type="button" onClick={() => void generateTracking(selected)} style={actionBtn}>Gerar rastreio + e-mail</button>
              <button type="button" onClick={() => setSelected(null)} style={{ ...actionBtn, background: "transparent", color: "#fff", border: "1px solid #3f3f46" }}>Fechar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 16 }}>
      <p style={{ margin: 0, color: "#a1a1aa", fontSize: 12 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800 }}>{value}</p>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: "0 14px",
        border: 0,
        borderRadius: 999,
        background: active ? "#fff" : "#18181b",
        color: active ? "#09090b" : "#fff",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const actionBtn: CSSProperties = {
  width: "100%",
  height: 42,
  border: 0,
  borderRadius: 10,
  background: "#fff",
  color: "#09090b",
  fontWeight: 800,
  cursor: "pointer",
};
