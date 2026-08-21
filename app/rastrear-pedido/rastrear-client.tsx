"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type TimelineItem = {
  etapa: string;
  descricao: string;
  data: string;
  concluido: boolean;
};

type Rastreio = {
  codigo: string;
  nome_cliente?: string;
  origem_at: string;
  endereco?: {
    rua?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
  } | null;
  timeline: TimelineItem[];
};

function formatWhen(iso: string, concluido: boolean) {
  const date = new Date(iso);
  const stamp =
    date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " — " +
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return concluido ? stamp : `Previsão: ${date.toLocaleDateString("pt-BR")}`;
}

function statusLabel(timeline: TimelineItem[]) {
  const last = [...timeline].reverse().find((item) => item.concluido);
  return last?.etapa || "Pedido confirmado";
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function RastrearPedidoClient() {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Rastreio | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("codigo") || params.get("code") || "";
    if (initial) {
      setCodigo(initial);
      void buscar(initial);
    }
  }, []);

  async function buscar(value = codigo) {
    const code = value.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rastrear?codigo=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Código não encontrado");
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Não foi possível rastrear");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void buscar();
  }

  const enderecoLinha = useMemo(() => {
    if (!data?.endereco) return "";
    const a = data.endereco;
    const rua = [a.rua, a.numero].filter(Boolean).join(", ");
    const resto = [
      a.complemento,
      a.bairro,
      a.cidade && a.estado ? `${a.cidade}, ${a.estado}` : a.cidade || a.estado,
      a.cep ? `CEP ${a.cep}` : "",
    ].filter(Boolean);
    return [rua, ...resto].filter(Boolean);
  }, [data]);

  const status = data ? statusLabel(data.timeline) : "";
  const previsao = data?.timeline?.length
    ? new Date(data.timeline[data.timeline.length - 1].data).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9", color: "#111827", fontFamily: "system-ui, Segoe UI, Arial, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 768, margin: "0 auto", padding: "24px 16px" }}>
          <Link href="/" style={{ color: "#6b7280", textDecoration: "none", fontSize: 14 }}>
            ← Voltar à loja
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "12px 0 4px" }}>Rastrear pedido</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Digite o código enviado pela MegaCapacetes para acompanhar sua entrega.
          </p>
        </div>
      </div>

      <main style={{ maxWidth: 768, margin: "0 auto", padding: "32px 16px 64px" }}>
        <section style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e5e7eb", marginBottom: 24 }}>
          <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="Ex: MC2A3B4C5D"
              style={{
                flex: 1,
                minWidth: 220,
                height: 48,
                border: error ? "1px solid #ef4444" : "1px solid #d1d5db",
                borderRadius: 12,
                padding: "0 14px",
                fontSize: 15,
                letterSpacing: 1,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                height: 48,
                padding: "0 22px",
                border: 0,
                borderRadius: 12,
                background: "#0b1f3a",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {loading ? "Buscando..." : "RASTREAR"}
            </button>
          </form>
          {error ? <p style={{ color: "#b91c1c", fontSize: 13, margin: "10px 0 0" }}>{error}</p> : null}
        </section>

        {data ? (
          <section style={{ background: "#fff", borderRadius: 16, padding: 22, border: "1px solid #e5e7eb", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                  Pedido
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{data.codigo}</p>
                {data.nome_cliente ? <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>{data.nome_cliente}</p> : null}
              </div>
              <span
                style={{
                  alignSelf: "flex-start",
                  background: "#dcfce7",
                  color: "#166534",
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: "8px 12px",
                }}
              >
                {status}
              </span>
            </div>

            {enderecoLinha.length ? (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  background: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 22,
                  color: "#4b5563",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#9ca3af", marginTop: 2 }}>
                  <PinIcon />
                </span>
                <span>{enderecoLinha.join(" · ")}</span>
              </div>
            ) : null}

            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.timeline.map((item, index) => {
                const last = index === data.timeline.length - 1;
                return (
                  <li key={item.etapa} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 99,
                          background: item.concluido ? "#16a34a" : "#d1d5db",
                          boxShadow: item.concluido ? "0 0 0 4px #dcfce7" : "none",
                        }}
                      />
                      {!last ? (
                        <span style={{ width: 2, flex: 1, minHeight: 28, background: item.concluido ? "#86efac" : "#e5e7eb", margin: "4px 0" }} />
                      ) : null}
                    </div>
                    <div style={{ paddingBottom: 18 }}>
                      <strong style={{ color: item.concluido ? "#111827" : "#9ca3af" }}>{item.etapa}</strong>
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{item.descricao}</div>
                      <div style={{ color: item.concluido ? "#16a34a" : "#9ca3af", fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                        {formatWhen(item.data, item.concluido)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {previsao ? (
              <div style={{ marginTop: 8, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: 14, color: "#9a3412", fontSize: 14 }}>
                <strong>Previsão de entrega:</strong> até {previsao}. Prazos podem variar por região.
              </div>
            ) : null}
          </section>
        ) : null}

        <section style={{ background: "#fff", borderRadius: 16, padding: 22, border: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Onde encontro meu código?</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#4b5563", fontSize: 14, lineHeight: 1.6 }}>
            <li style={{ marginBottom: 8 }}>No e-mail de confirmação — enviamos o código assim que o pagamento é confirmado.</li>
            <li style={{ marginBottom: 8 }}>O código começa com <strong>MC</strong> seguido de letras e números (ex: MC2A3B4C5D).</li>
            <li>
              Dúvidas? Fale conosco na página de{" "}
              <Link href="/contato" style={{ color: "#0b1f3a", fontWeight: 700 }}>
                contato
              </Link>
              .
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
