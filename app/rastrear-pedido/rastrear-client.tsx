"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { StoreChrome } from "../store-chrome";

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
    bairro?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
  } | null;
  timeline: TimelineItem[];
};

export function RastrearPedidoClient() {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Rastreio | null>(null);
  const [showTaxa, setShowTaxa] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

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

  const endereco = useMemo(() => {
    if (!data?.endereco) return "";
    const a = data.endereco;
    return [a.rua, a.numero, a.bairro, a.cidade, a.estado, a.cep].filter(Boolean).join(" · ");
  }, [data]);

  async function onComprovante(file: File | undefined) {
    if (!file || !data?.codigo) return;
    setUploading(true);
    setUploadMsg("Enviando comprovante...");
    try {
      const toBase64 = await file.arrayBuffer();
      const bytes = new Uint8Array(toBase64);
      let binary = "";
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      const dataUrl = `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
      const res = await fetch("/api/comprovantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_code: data.codigo,
          file_url: dataUrl,
          file_name: file.name,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Falha no upload");
      setUploadMsg("Comprovante enviado. Nossa equipe vai conferir a taxa de reenvio.");
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Erro ao enviar comprovante");
    } finally {
      setUploading(false);
    }
  }

  return (
    <StoreChrome>
      <h1 style={{ fontSize: 32, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Rastrear pedido</h1>
      <p style={{ color: "#4b5563", marginBottom: 24 }}>Digite o código enviado no e-mail de confirmação.</p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Ex: MCXXXXXXXX"
          style={{ flex: 1, height: 48, border: "1px solid #d1d5db", borderRadius: 10, padding: "0 14px", fontSize: 16, letterSpacing: 1 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ height: 48, padding: "0 20px", border: 0, borderRadius: 10, background: "#0b1f3a", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {data ? (
        <section style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 8px 30px rgba(11,31,58,.06)" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Código</p>
          <p style={{ margin: "4px 0 16px", fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>{data.codigo}</p>
          {data.nome_cliente ? <p style={{ marginTop: 0 }}>Destinatário: <strong>{data.nome_cliente}</strong></p> : null}
          {endereco ? <p style={{ color: "#4b5563" }}>Entrega: {endereco}</p> : null}

          <ol style={{ listStyle: "none", padding: 0, margin: "24px 0 0" }}>
            {data.timeline.map((item) => (
              <li key={item.etapa} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 12, marginBottom: 16 }}>
                <span style={{ width: 14, height: 14, marginTop: 4, borderRadius: 99, background: item.concluido ? "#16a34a" : "#d1d5db" }} />
                <div>
                  <strong>{item.etapa}</strong>
                  <div style={{ color: "#6b7280", fontSize: 14 }}>{item.descricao}</div>
                  <div style={{ color: "#9ca3af", fontSize: 12 }}>{new Date(item.data).toLocaleString("pt-BR")}</div>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => setShowTaxa(true)}
            style={{ marginTop: 8, background: "transparent", border: "1px solid #0b1f3a", color: "#0b1f3a", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}
          >
            Preciso reenviar / taxa de reenvio
          </button>
        </section>
      ) : null}

      {showTaxa ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,58,.55)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: "#fff", maxWidth: 420, width: "100%", borderRadius: 16, padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Taxa de reenvio</h2>
            <p>Para reenviar o pedido cobramos uma taxa de <strong>R$ 9,00</strong> via PIX. Envie o comprovante abaixo.</p>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={uploading}
              onChange={(e) => void onComprovante(e.target.files?.[0])}
            />
            {uploadMsg ? <p style={{ fontSize: 14 }}>{uploadMsg}</p> : null}
            <button type="button" onClick={() => setShowTaxa(false)} style={{ marginTop: 16, width: "100%", height: 44, border: 0, borderRadius: 10, background: "#0b1f3a", color: "#fff", fontWeight: 700 }}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </StoreChrome>
  );
}
