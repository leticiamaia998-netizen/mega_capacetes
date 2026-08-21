"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatTimelineWhen, reenvioTimelineFrom, TAXA_REENVIO_VALOR } from "@/lib/store/tracking-ui";

type TimelineItem = {
  etapa: string;
  descricao: string;
  data: string;
  concluido: boolean;
  erro?: boolean;
  taxa?: boolean;
};

type Rastreio = {
  codigo: string;
  nome_cliente?: string;
  email?: string | null;
  origem_at: string;
  status?: string;
  previsao?: string;
  falhaEntrega?: boolean;
  aguardandoTaxa?: boolean;
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

type TaxaPix = {
  pixCode: string;
  qrCode: string;
  qrCodeBase64: string;
};

type PopupStep = "pix" | "comprovante" | "confirmado";

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function PixIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor">
      <path d="M112.57 391.19c20.056 0 38.928-7.808 53.12-22l76.693-76.692c5.385-5.386 14.765-5.373 20.136 0l76.989 76.989c14.192 14.192 33.064 22 53.12 22h15.138l-97.2 97.2c-30.418 30.417-79.73 30.417-110.148 0l-97.49-97.497h10.642z" />
      <path d="M112.57 120.81c20.056 0 38.928 7.808 53.12 22l76.693 76.692c5.565 5.566 14.57 5.566 20.136 0l76.989-76.989c14.192-14.192 33.064-22 53.12-22h10.642l-97.49-97.49c-30.418-30.417-79.73-30.417-110.148 0l-97.2 97.2 14.138-.413z" />
      <path d="M458.783 200.643l-54.36-54.36h-11.795c-14.14 0-27.68 5.62-37.667 15.606l-76.989 76.989c-13.693 13.693-37.438 13.706-51.144 0l-76.693-76.692c-9.987-9.987-23.527-15.607-37.667-15.607H97.327l-54.11 54.11c-30.418 30.417-30.418 79.73 0 110.147l54.11 54.111h15.141c14.14 0 27.68-5.62 37.667-15.607l76.693-76.692c6.924-6.924 15.983-10.387 25.572-10.387 9.588 0 18.648 3.463 25.572 10.387l76.989 76.989c9.987 9.987 23.527 15.607 37.667 15.607h11.795l54.36-54.361c30.417-30.417 30.417-79.73 0-110.24z" />
    </svg>
  );
}

function buildQrSrc(qr?: string) {
  if (!qr) return null;
  if (qr.startsWith("data:") || qr.startsWith("http")) return qr;
  return `data:image/png;base64,${qr}`;
}

function TaxaPopup({
  codigo,
  nome,
  email,
  onConfirmado,
  onFechar,
}: {
  codigo: string;
  nome: string;
  email?: string | null;
  onConfirmado: () => void;
  onFechar: () => void;
}) {
  const [step, setStep] = useState<PopupStep>("pix");
  const [pix, setPix] = useState<TaxaPix | null>(null);
  const [pixLoading, setPixLoading] = useState(true);
  const [pixErro, setPixErro] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPixLoading(true);
      setPixErro("");
      try {
        const res = await fetch("/api/pix/taxa-reenvio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigoRastreio: codigo, nome, email: email || undefined }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          pixCode?: string;
          copyPaste?: string;
          qrCode?: string;
          qrCodeBase64?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success || !json.pixCode) {
          throw new Error(json.error || "Erro ao gerar Pix.");
        }
        const code = json.pixCode || json.copyPaste || "";
        const qr = json.qrCodeBase64 || json.qrCode || "";
        setPix({ pixCode: code, qrCode: qr, qrCodeBase64: qr });
      } catch (err) {
        if (!cancelled) setPixErro(err instanceof Error ? err.message : "Erro ao gerar Pix.");
      } finally {
        if (!cancelled) setPixLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [codigo, nome, email]);

  async function copiar() {
    if (!pix?.pixCode) return;
    try {
      await navigator.clipboard.writeText(pix.pixCode);
    } catch {
      /* ok */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function enviarComprovante(file: File) {
    setStep("confirmado");
    setTimeout(() => {
      onConfirmado();
      onFechar();
    }, 2500);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      const dataUrl = `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
      await fetch("/api/comprovantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_code: codigo,
          file_url: dataUrl,
          file_name: file.name,
        }),
      });
    } catch {
      /* upload em segundo plano — confirmação imediata como no guia */
    }
  }

  const qrSrc = buildQrSrc(pix?.qrCodeBase64 || pix?.qrCode);
  const podFechar = step !== "confirmado";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(11,31,58,.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (podFechar && e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        style={{
          background: "#fff",
          maxWidth: 420,
          width: "100%",
          borderRadius: 16,
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 20px 12px",
            background: step === "confirmado" ? "#16a34a" : "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            {step === "pix" && (
              <>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#111827" }}>Pagar taxa de reenvio</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                  Pix • R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")}
                </p>
              </>
            )}
            {step === "comprovante" && (
              <>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#111827" }}>Confirmar pagamento</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>Envie o comprovante do Pix</p>
              </>
            )}
            {step === "confirmado" && (
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#fff" }}>Pagamento confirmado!</p>
            )}
          </div>
          {podFechar ? (
            <button
              type="button"
              onClick={onFechar}
              style={{
                width: 32,
                height: 32,
                border: 0,
                borderRadius: 99,
                background: "#f3f4f6",
                cursor: "pointer",
                fontSize: 18,
                color: "#6b7280",
              }}
            >
              ×
            </button>
          ) : null}
        </div>

        <div style={{ overflowY: "auto", padding: "0 20px 20px", flex: 1 }}>
          {step === "pix" && (
            <div>
              {pixLoading ? (
                <p style={{ textAlign: "center", color: "#6b7280", padding: "32px 0" }}>Gerando Pix...</p>
              ) : pixErro ? (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, color: "#b91c1c", fontSize: 14, textAlign: "center" }}>
                  {pixErro}
                </div>
              ) : pix ? (
                <>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Taxa de reenvio</p>
                    <p style={{ margin: "4px 0", fontSize: 28, fontWeight: 800, color: "#15803d" }}>
                      R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#16a34a" }}>Entrega em até 2 dias úteis após confirmação</p>
                  </div>

                  {qrSrc ? (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                      <img src={qrSrc} alt="QR Code Pix" style={{ width: 176, height: 176, objectFit: "contain", border: "2px solid #bbf7d0", borderRadius: 12, padding: 8 }} />
                    </div>
                  ) : null}

                  <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginBottom: 8 }}>Ou copie o código Pix:</p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pix.pixCode}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copiar()}
                      style={{ flexShrink: 0, padding: "0 14px", border: 0, borderRadius: 10, background: copied ? "#15803d" : "#0b1f3a", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep("comprovante")}
                    style={{ width: "100%", height: 44, border: "2px solid #16a34a", borderRadius: 10, background: "#fff", color: "#15803d", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                  >
                    Já paguei — enviar comprovante
                  </button>
                </>
              ) : null}
            </div>
          )}

          {step === "comprovante" && (
            <div>
              <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
                Envie o comprovante do Pix de R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")}. Assim que recebermos, seu pedido é
                despachado com prioridade.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void enviarComprovante(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "28px 16px",
                  border: "2px dashed #86efac",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  cursor: "pointer",
                  color: "#166534",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                Toque para anexar comprovante
              </button>
              <button type="button" onClick={() => setStep("pix")} style={{ marginTop: 12, width: "100%", border: 0, background: "transparent", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
                ← Voltar ao QR Code
              </button>
            </div>
          )}

          {step === "confirmado" && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: 99, background: "#16a34a", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 28 }}>
                ✓
              </div>
              <p style={{ fontWeight: 800, fontSize: 18, margin: "0 0 8px" }}>Comprovante recebido!</p>
              <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Seu reenvio foi aprovado. Acompanhe na linha do tempo abaixo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RastrearPedidoClient() {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Rastreio | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [taxaPaga, setTaxaPaga] = useState(false);
  const [pagoEm, setPagoEm] = useState<string | null>(null);

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
    if (!data?.endereco) return [];
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

  const status = data?.status || "";
  const reenvioTimeline = taxaPaga && pagoEm ? reenvioTimelineFrom(pagoEm, data?.nome_cliente) : null;

  function statusBadgeStyle() {
    if (data?.aguardandoTaxa) return { background: "#ffedd5", color: "#c2410c" };
    if (data?.falhaEntrega) return { background: "#fee2e2", color: "#b91c1c" };
    return { background: "#dcfce7", color: "#166534" };
  }

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

        {data?.falhaEntrega ? (
          <section
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 16,
              padding: 18,
              marginBottom: 24,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: "#dc2626", marginTop: 2 }}>
              <AlertIcon />
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: "#b91c1c", fontSize: 14 }}>Falha na tentativa de entrega</p>
              <p style={{ margin: "6px 0 0", color: "#dc2626", fontSize: 13, lineHeight: 1.5 }}>
                A transportadora tentou realizar a entrega, mas não localizou nenhum responsável no endereço. O produto está
                retornando ao CD em <strong>Guarulhos, SP</strong>.
              </p>
              {data.aguardandoTaxa ? (
                <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>
                  Pague a taxa de reenvio abaixo para receber seu pedido em até 2 dias úteis.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {data?.aguardandoTaxa && !taxaPaga ? (
          <section style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #fed7aa", marginBottom: 24 }}>
            <div style={{ background: "#ea580c", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#fff" }}>
                <PixIcon size={22} />
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 800, color: "#fff", fontSize: 14 }}>Taxa de reenvio necessária</p>
                <p style={{ margin: "2px 0 0", color: "#ffedd5", fontSize: 12 }}>
                  Pague R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")} e receba em até 2 dias úteis
                </p>
              </div>
            </div>
            <div style={{ background: "#fff", padding: 20 }}>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
                Seu pedido chegou ao Centro de Distribuição em <strong>Guarulhos, SP</strong> e está aguardando a taxa de
                reenvio para ser despachado novamente ao seu endereço.
              </p>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Taxa de reenvio — valor único</p>
                <p style={{ margin: "4px 0", fontSize: 32, fontWeight: 800, color: "#15803d" }}>
                  R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPopup(true)}
                style={{
                  width: "100%",
                  height: 48,
                  border: 0,
                  borderRadius: 12,
                  background: "#0b1f3a",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <PixIcon size={20} />
                Pagar R$ {TAXA_REENVIO_VALOR.toFixed(2).replace(".", ",")} e receber meu pedido
              </button>
            </div>
          </section>
        ) : null}

        {taxaPaga ? (
          <section style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 16, padding: 16, marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 36, height: 36, borderRadius: 99, background: "#16a34a", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>
              ✓
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: "#166534", fontSize: 14 }}>Reenvio aprovado!</p>
              <p style={{ margin: "2px 0 0", color: "#15803d", fontSize: 12 }}>Acompanhe o novo despacho na linha do tempo abaixo.</p>
            </div>
          </section>
        ) : null}

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
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: "8px 12px",
                  ...statusBadgeStyle(),
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
                const isErro = Boolean(item.erro);
                const isTaxa = Boolean(item.taxa);
                const dotColor = isErro ? "#ef4444" : isTaxa ? "#ea580c" : item.concluido ? "#16a34a" : "#d1d5db";
                const lineColor = isErro ? "#fecaca" : item.concluido ? "#86efac" : "#e5e7eb";
                const titleColor = isErro ? "#b91c1c" : isTaxa ? "#c2410c" : item.concluido ? "#111827" : "#9ca3af";
                const dateColor = isErro ? "#ef4444" : isTaxa ? "#ea580c" : item.concluido ? "#16a34a" : "#9ca3af";

                return (
                  <li key={`${item.etapa}-${index}`} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 99,
                          background: dotColor,
                          boxShadow: item.concluido && !isErro ? "0 0 0 4px #dcfce7" : isErro ? "0 0 0 4px #fee2e2" : "none",
                        }}
                      />
                      {!last ? (
                        <span style={{ width: 2, flex: 1, minHeight: 28, background: lineColor, margin: "4px 0" }} />
                      ) : null}
                    </div>
                    <div style={{ paddingBottom: 18 }}>
                      <strong style={{ color: titleColor }}>{item.etapa}</strong>
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{item.descricao}</div>
                      <div style={{ color: dateColor, fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                        {formatTimelineWhen(item.data, item.concluido && !isErro)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {!data.falhaEntrega && !taxaPaga && data.previsao ? (
              <div style={{ marginTop: 8, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: 14, color: "#9a3412", fontSize: 14 }}>
                <strong>Previsão de entrega:</strong> até {data.previsao}. Prazos podem variar por região.
              </div>
            ) : null}
          </section>
        ) : null}

        {reenvioTimeline ? (
          <section style={{ background: "#fff", borderRadius: 16, padding: 22, border: "1px solid #86efac", marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#166534" }}>Reenvio em andamento</h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {reenvioTimeline.map((item, index) => {
                const last = index === reenvioTimeline.length - 1;
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
                        {formatTimelineWhen(item.data, item.concluido)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section style={{ background: "#fff", borderRadius: 16, padding: 22, border: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Onde encontro meu código?</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#4b5563", fontSize: 14, lineHeight: 1.6 }}>
            <li style={{ marginBottom: 8 }}>No e-mail de confirmação — enviamos o código assim que o pagamento é confirmado.</li>
            <li style={{ marginBottom: 8 }}>
              O código começa com <strong>MC</strong> seguido de letras e números (ex: MC2A3B4C5D).
            </li>
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

      {showPopup && data ? (
        <TaxaPopup
          codigo={data.codigo}
          nome={data.nome_cliente || "Cliente"}
          email={data.email}
          onConfirmado={() => {
            setTaxaPaga(true);
            setPagoEm(new Date().toISOString());
          }}
          onFechar={() => setShowPopup(false)}
        />
      ) : null}
    </div>
  );
}
