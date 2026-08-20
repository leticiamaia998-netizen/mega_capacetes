import Link from "next/link";

export function StoreChrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9", color: "#0b1f3a", fontFamily: "Poppins, Space Grotesk, Arial, sans-serif" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ background: "#0b1f3a", color: "#fff", textAlign: "center", fontSize: 12, padding: "10px 16px" }}>
          Frete grátis para todo o Brasil
        </div>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, padding: "0 24px", height: 72 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center" }}>
            <img src="/assets/remotox-logo.svg" alt="MegaCapacetes" style={{ height: 36 }} />
          </Link>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 18, fontSize: 14, fontWeight: 600 }}>
            <Link href="/produtos" style={{ color: "#0b1f3a", textDecoration: "none" }}>Produtos</Link>
            <Link href="/rastrear-pedido" style={{ color: "#0b1f3a", textDecoration: "none" }}>Rastrear</Link>
            <Link href="/contato" style={{ color: "#0b1f3a", textDecoration: "none" }}>Contato</Link>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>{children}</main>
    </div>
  );
}
