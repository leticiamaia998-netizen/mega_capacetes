"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StoreChrome } from "../store-chrome";

function SuccessBody() {
  const params = useSearchParams();
  const status = params.get("status") || "pending";
  const payment = params.get("payment") || "pix";
  const approved = status === "approved" || status === "pago" || status === "paid";
  const declined = status === "declined" || status === "recusado";

  return (
    <StoreChrome>
      <section style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 8px 30px rgba(11,31,58,.06)" }}>
        <h1 style={{ fontSize: 32, marginTop: 0 }}>
          {approved ? "Pagamento aprovado" : declined ? "Pagamento não autorizado" : "Pedido registrado"}
        </h1>
        <p style={{ color: "#4b5563", fontSize: 16, lineHeight: 1.6 }}>
          {approved
            ? "Recebemos seu pagamento. O código de rastreio será enviado por e-mail e já pode ser consultado na página de rastreio."
            : declined
              ? "O cartão foi recusado. Você pode tentar outro cartão ou pagar com PIX."
              : payment === "pix"
                ? "Seu PIX foi gerado. Assim que o pagamento confirmar, você recebe o rastreio por e-mail."
                : "Estamos processando seu pagamento."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
          <Link href="/rastrear-pedido" style={{ background: "#0b1f3a", color: "#fff", textDecoration: "none", padding: "12px 20px", borderRadius: 10, fontWeight: 700 }}>
            Rastrear pedido
          </Link>
          <Link href="/" style={{ border: "1px solid #0b1f3a", color: "#0b1f3a", textDecoration: "none", padding: "12px 20px", borderRadius: 10, fontWeight: 700 }}>
            Voltar à loja
          </Link>
        </div>
      </section>
    </StoreChrome>
  );
}

export default function SucessoPage() {
  return (
    <Suspense fallback={<StoreChrome><p>Carregando...</p></StoreChrome>}>
      <SuccessBody />
    </Suspense>
  );
}
