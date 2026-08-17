"use client";

import { useEffect, useState } from "react";

const APP_SCRIPT_ID = "stormzx-storefront-script";

export default function LegacyStorefront() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (document.getElementById(APP_SCRIPT_ID)) return;

    if (typeof window.crypto.randomUUID !== "function") {
      Object.defineProperty(window.crypto, "randomUUID", {
        configurable: true,
        value: () => {
          const bytes = window.crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6] & 0x0f) | 0x40;
          bytes[8] = (bytes[8] & 0x3f) | 0x80;
          const hex = Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, "0"),
          );

          return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
        },
      });
    }

    const script = document.createElement("script");
    script.id = APP_SCRIPT_ID;
    script.type = "module";
    script.src = "/assets/index-D36WQRm9.js?v=ironpay-20260817";
    script.addEventListener("error", () => setFailed(true), { once: true });
    document.body.appendChild(script);
  }, []);

  return (
    <div id="root">
      {failed ? (
        <main className="storefront-error" role="alert">
          <p>Não foi possível carregar a loja. Atualize a página para tentar novamente.</p>
        </main>
      ) : null}
    </div>
  );
}
