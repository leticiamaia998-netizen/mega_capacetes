"use client";

import { useEffect, useState } from "react";

const APP_SCRIPT_ID = "stormzx-storefront-script";

const FUNCTION_MAP: Record<string, string> = {
  "checkout-create-pix": "/api/pix/create",
  "checkout-card": "/api/card/create",
  "pix-webhook": "/api/pix/webhook",
  admin: "/api/admin",
  orders: "/api/orders",
  checkout: "/api/checkout",
  "send-tracking-email": "/api/send-tracking-email",
  "send-recovery-email": "/api/send-recovery-email",
  "fb-purchase": "/api/fb-purchase",
  "utmify-order": "/api/utmify-order",
  "get-visitor-location": "/api/get-visitor-location",
};

function jwtRole(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.role || "");
  } catch {
    return "";
  }
}

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

    const originalFetch = window.fetch.bind(window);
    const OriginalWebSocket = window.WebSocket;

    void (async () => {
      const cfg = await originalFetch("/api/public-config")
        .then((res) => res.json())
        .catch(() => ({ supabaseUrl: "", supabaseAnonKey: "" }));
      const target = String(cfg.supabaseUrl || "").replace(/\/$/, "");
      const anon = String(cfg.supabaseAnonKey || "");

      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const fn = rawUrl.match(/\/functions\/v1\/([^/?]+)/);
        if (fn?.[1] && FUNCTION_MAP[fn[1]]) {
          return originalFetch(FUNCTION_MAP[fn[1]], init);
        }

        if (target && rawUrl.includes(".supabase.co")) {
          const nextUrl = rawUrl.replace(/https:\/\/[^/]+\.supabase\.co/i, target);
          const headers = new Headers(
            init?.headers || (input instanceof Request ? input.headers : undefined),
          );
          if (anon) {
            headers.set("apikey", anon);
            const auth = headers.get("Authorization") || headers.get("authorization") || "";
            const token = auth.replace(/^Bearer\s+/i, "");
            if (!token || jwtRole(token) !== "authenticated") {
              headers.set("Authorization", `Bearer ${anon}`);
            }
          }
          return originalFetch(nextUrl, { ...init, headers });
        }

        return originalFetch(input, init);
      };

      window.WebSocket = function PatchedWebSocket(url: string | URL, protocols?: string | string[]) {
        let next = String(url);
        if (target && next.includes(".supabase.co")) {
          const wsTarget = target.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
          next = next.replace(/wss:\/\/[^/]+\.supabase\.co/i, wsTarget);
          if (anon) next = next.replace(/apikey=[^&]+/, `apikey=${encodeURIComponent(anon)}`);
        }
        return new OriginalWebSocket(next, protocols);
      } as typeof WebSocket;
      window.WebSocket.prototype = OriginalWebSocket.prototype;
      Object.assign(window.WebSocket, OriginalWebSocket);

      const script = document.createElement("script");
      script.id = APP_SCRIPT_ID;
      script.type = "module";
      script.src = "/assets/index-D36WQRm9.js";
      script.addEventListener("error", () => setFailed(true), { once: true });
      script.addEventListener("load", () => {
        if (window.location.pathname === "/xxx") {
          const adminEnhancements = document.createElement("script");
          adminEnhancements.type = "module";
          adminEnhancements.src = "/admin-enhancements.js";
          document.body.appendChild(adminEnhancements);
        }
        if (window.location.pathname === "/checkout") {
          const paymentEnhancements = document.createElement("script");
          paymentEnhancements.type = "module";
          paymentEnhancements.src = "/checkout-payment-enhancements.js";
          document.body.appendChild(paymentEnhancements);
        }
        if (window.location.pathname === "/pix") {
          const pixEnhancements = document.createElement("script");
          pixEnhancements.type = "module";
          pixEnhancements.src = "/pix-payment-enhancements.js";
          document.body.appendChild(pixEnhancements);
        }
      }, { once: true });
      document.body.appendChild(script);
    })();
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
