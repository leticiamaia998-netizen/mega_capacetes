"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type OrderItem = {
  name?: string;
  image?: string;
  quantity?: number;
  price?: number;
  size?: string;
};

type OrderInfo = {
  orderId: string;
  paid: boolean;
  status: string;
  amount: number;
  customerName: string;
  email: string;
  items: OrderItem[];
  codigoRastreio: string;
  gateway: string;
  city: string;
  state: string;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function readLocalOrder(orderId: string | null): Partial<OrderInfo> {
  try {
    const state = JSON.parse(sessionStorage.getItem("pixPageState") || sessionStorage.getItem("mcCheckoutSnapshot") || "{}");
    const items = Array.isArray(state.items) ? state.items : [];
    return {
      orderId: orderId || state.orderId || "",
      amount: Number(state.amount || 0),
      customerName: state.customer?.name || state.customerName || "",
      email: state.customer?.email || "",
      items,
    };
  } catch {
    return { orderId: orderId || "", items: [] };
  }
}

function SuccessBody() {
  const params = useSearchParams();
  const status = params.get("status") || "pending";
  const payment = params.get("payment") || "pix";
  const orderId = params.get("orderId");
  const approved = status === "approved" || status === "pago" || status === "paid";
  const declined = status === "declined" || status === "recusado";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const local = useMemo(() => readLocalOrder(orderId), [orderId]);

  useEffect(() => {
    if (!orderId) {
      setOrder({
        orderId: local.orderId || "",
        paid: approved,
        status,
        amount: Number(local.amount || 0),
        customerName: local.customerName || "",
        email: local.email || "",
        items: local.items || [],
        codigoRastreio: "",
        gateway: "",
        city: "",
        state: "",
      });
      return;
    }
    void fetch(`/api/pix/status?orderId=${encodeURIComponent(orderId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) return;
        const apiItems = Array.isArray(data.items) ? data.items : [];
        const localItems = local.items || [];
        setOrder({
          orderId: data.orderId,
          paid: Boolean(data.paid || approved),
          status: data.status || status,
          amount: Number(data.amount || local.amount || 0),
          customerName: data.customerName || local.customerName || "",
          email: data.email || local.email || "",
          items: apiItems.some((item: OrderItem) => item.image) ? apiItems : localItems.length ? localItems : apiItems,
          codigoRastreio: data.codigoRastreio || "",
          gateway: data.gateway || "",
          city: data.city || "",
          state: data.state || "",
        });
      })
      .catch(() => {
        setOrder({
          orderId: orderId || "",
          paid: approved,
          status,
          amount: Number(local.amount || 0),
          customerName: local.customerName || "",
          email: local.email || "",
          items: local.items || [],
          codigoRastreio: "",
          gateway: "",
          city: "",
          state: "",
        });
      });
  }, [orderId, approved, status, local.amount, local.customerName, local.email, local.items, local.orderId]);

  const items = order?.items?.length ? order.items : local.items || [];
  const amount = order?.amount || Number(local.amount || 0);
  const codigo = order?.codigoRastreio || "";
  const destination = [order?.city, order?.state].filter(Boolean).join(" / ");
  const paid = Boolean(order?.paid || approved);

  const steps = [
    { label: "Pedido efetuado", done: true },
    { label: paid ? "Pagamento confirmado" : "Aguardando pagamento", done: paid, current: !paid },
    { label: "Em separação", done: false, current: paid },
    { label: "Entrega", done: false },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", color: "#111827", fontFamily: "system-ui, Segoe UI, Arial, sans-serif" }}>
      <div style={{ background: "#0b1f3a", color: "#fff", textAlign: "center", padding: "12px 16px", fontSize: 14 }}>
        Status: <strong>{paid ? "Pagamento confirmado" : declined ? "Pagamento não autorizado" : "Pedido registrado"}</strong>
      </div>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 48px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: paid ? "#dcfce7" : declined ? "#fee2e2" : "#ffedd5",
            color: paid ? "#166534" : declined ? "#991b1b" : "#9a3412",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          {paid ? "PIX aprovado" : declined ? "Cartão recusado" : payment === "pix" ? "PIX gerado" : "Processando"}
        </div>

        <section style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, border: "1px solid #e5e7eb" }}>
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {item.image ? (
                <img src={item.image} alt={item.name || "Produto"} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 10, background: "#f3f4f6", display: "grid", placeItems: "center", color: "#6b7280", fontSize: 11 }}>Produto</div>
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 18, margin: 0 }}>{item.name || "Pedido MegaCapacetes"}</h1>
                <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                  {item.size ? `Tamanho ${item.size} · ` : ""}
                  Qtd {item.quantity || 1}
                  {amount ? ` · ${money(amount)}` : ""}
                </p>
              </div>
            </div>
          ))}
          {!items.length ? (
            <h1 style={{ fontSize: 18, margin: 0 }}>Pedido MegaCapacetes</h1>
          ) : null}
          {order?.orderId ? (
            <p style={{ margin: "12px 0 0", color: "#6b7280", fontSize: 13 }}>Pedido: {order.orderId.slice(0, 8).toUpperCase()}</p>
          ) : null}
          {destination ? (
            <p style={{ margin: "8px 0 0", background: "#f3f4f6", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
              Entrega: {destination}
            </p>
          ) : null}
        </section>

        <section style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center", fontSize: 11, fontWeight: 700 }}>
            {steps.map((step, index) => (
              <div key={step.label}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    margin: "0 auto 6px",
                    borderRadius: 99,
                    background: step.done ? "#16a34a" : step.current ? "#f97316" : "#e5e7eb",
                    color: step.done || step.current ? "#fff" : "#6b7280",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {step.done ? "✓" : index + 1}
                </div>
                {step.label}
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, border: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{paid ? "Pagamento recebido" : declined ? "Não autorizado" : "Pedido registrado"}</h2>
          <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
            {paid
              ? "Recebemos seu pagamento. O código de rastreio já pode ser consultado e também será enviado por e-mail."
              : declined
                ? "O cartão foi recusado. Você pode voltar ao checkout e pagar com PIX."
                : payment === "pix"
                  ? "Seu PIX foi gerado pelo gateway ativo da loja. Quando o pagamento confirmar, esta página atualiza o rastreio."
                  : "Estamos processando seu pagamento."}
          </p>
          {codigo ? (
            <p style={{ margin: "14px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{codigo}</p>
          ) : null}
          {order?.email ? (
            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 13 }}>Confirmação: {order.email}</p>
          ) : null}
        </section>

        <div style={{ display: "grid", gap: 10 }}>
          <Link
            href={codigo ? `/rastrear-pedido?codigo=${encodeURIComponent(codigo)}` : "/rastrear-pedido"}
            style={{ display: "block", textAlign: "center", background: "#0b1f3a", color: "#fff", textDecoration: "none", padding: "14px 18px", borderRadius: 12, fontWeight: 700 }}
          >
            Acompanhar pedido
          </Link>
          <Link
            href="/"
            style={{ display: "block", textAlign: "center", border: "1px solid #0b1f3a", color: "#0b1f3a", textDecoration: "none", padding: "14px 18px", borderRadius: 12, fontWeight: 700 }}
          >
            Voltar à loja
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function SucessoPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Carregando...</p>}>
      <SuccessBody />
    </Suspense>
  );
}
