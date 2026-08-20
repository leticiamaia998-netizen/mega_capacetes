"use client";

import { useEffect, useState } from "react";

const APP_SCRIPT_ID = "stormzx-storefront-script";
const ENHANCEMENTS_VERSION = "10";

declare global {
  interface Window {
    __mcCardMode?: boolean;
    __mcNativeFetch?: typeof fetch;
  }
}

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

// O painel compilado lê orders.status num mapa fechado e faz
// total_amount.toLocaleString(): qualquer status fora do mapa ou valor nulo
// derruba a tela inteira. Normalizamos a resposta antes de entregar ao app.
const ADMIN_STATUS = ["pending", "paid", "cancelled", "refunded"];

function normalizeStatus(raw: unknown) {
  const value = String(raw || "").toLowerCase();
  if (ADMIN_STATUS.includes(value)) return value;
  if (["pago", "approved", "aprovado", "completed", "authorized"].includes(value)) return "paid";
  if (["canceled", "cancelado", "expired", "expirado"].includes(value)) return "cancelled";
  if (["reembolsado", "estornado", "chargeback"].includes(value)) return "refunded";
  return "pending";
}

async function safeOrdersResponse(response: Response) {
  if (!(response.headers.get("content-type") || "").includes("application/json")) return response;
  try {
    const rows = await response.clone().json();
    if (!Array.isArray(rows)) return response;
    let changed = false;
    const safe = rows.map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...row } as Record<string, unknown>;
      if ("status" in next) {
        const normalized = normalizeStatus(next.status);
        if (normalized !== next.status) {
          next.status_detalhe = next.status_detalhe ?? next.status;
          next.status = normalized;
          changed = true;
        }
      }
      for (const field of ["total_amount", "valor"]) {
        if (field in next && next[field] == null) {
          next[field] = 0;
          changed = true;
        }
      }
      return next;
    });
    if (!changed) return response;
    return new Response(JSON.stringify(safe), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
}

function readCheckoutSnapshot() {
  try {
    const snap = JSON.parse(sessionStorage.getItem("mcCheckoutSnapshot") || "null");
    if (snap && typeof snap === "object") return snap as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  try {
    const pix = JSON.parse(sessionStorage.getItem("pixPageState") || "null");
    if (pix && typeof pix === "object") return pix as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

function asRecord(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function enrichPixCreateInit(init?: RequestInit): RequestInit | undefined {
  if (!init?.body || typeof init.body !== "string") return init;
  try {
    const parsed = JSON.parse(init.body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return init;
    const snap = readCheckoutSnapshot();
    const customer = { ...asRecord(snap.customer), ...asRecord(parsed.customer) };
    const address = {
      ...asRecord(snap.shippingAddress),
      ...asRecord(snap.shippingAddressFull),
      ...asRecord(parsed.shippingAddress),
      ...asRecord(parsed.shippingAddressFull),
    };
    const amount = Number(parsed.amount || snap.amount || 0);
    const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
    const snapItems = Array.isArray(snap.items) ? snap.items : [];
    const items = parsedItems.length ? parsedItems : snapItems.length ? snapItems : [{ name: "Pedido", quantity: 1, price: amount }];
    return {
      ...init,
      body: JSON.stringify({
        ...parsed,
        amount,
        customer,
        customerName: customer.name,
        items,
        shippingAddress: address,
        shippingAddressFull: address,
        orderId: parsed.orderId || snap.orderId,
        fallbackFromCard: Boolean(parsed.fallbackFromCard || snap.orderId),
      }),
    };
  } catch {
    return init;
  }
}

function jwtRole(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.role || "");
  } catch {
    return "";
  }
}

function reportCrash(detail: string) {
  window.setTimeout(() => {
    const root = document.getElementById("root");
    if (!root || root.childElementCount > 0) return;
    const box = document.createElement("main");
    box.dataset.storefrontCrash = "1";
    box.style.cssText =
      "min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#09090b;color:#fff;text-align:center;font-family:system-ui,sans-serif;";
    const title = document.createElement("p");
    title.style.cssText = "font-size:16px;font-weight:700;margin:0;";
    title.textContent = "Não foi possível abrir esta página.";
    const message = document.createElement("p");
    message.style.cssText = "font-size:13px;color:#a1a1aa;max-width:520px;margin:0;line-height:1.5;";
    message.textContent = detail || "Erro desconhecido";
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Recarregar";
    reload.style.cssText =
      "height:44px;padding:0 22px;border:0;border-radius:999px;background:#fff;color:#09090b;font-weight:700;cursor:pointer;";
    reload.addEventListener("click", () => window.location.reload());
    box.append(title, message, reload);
    root.appendChild(box);
  }, 400);
}

export default function LegacyStorefront() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (document.getElementById(APP_SCRIPT_ID)) return;

    window.addEventListener("error", (event) => reportCrash(event.message));
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason as { message?: string } | string | undefined;
      reportCrash(typeof reason === "string" ? reason : reason?.message || "");
    });

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
    window.__mcNativeFetch = originalFetch;
    const OriginalWebSocket = window.WebSocket;

    void (async () => {
      const cfg = await originalFetch("/api/public-config")
        .then((res) => res.json())
        .catch(() => ({ supabaseUrl: "", supabaseAnonKey: "" }));
      const target = String(cfg.supabaseUrl || "").replace(/\/$/, "");
      const anon = String(cfg.supabaseAnonKey || "");

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        // Só bloqueia PIX automático enquanto o cartão está sendo cobrado no checkout.
        // Na página /pix ou depois da recusa o QR precisa ser gerado normalmente.
        const payingCardOnCheckout =
          window.__mcCardMode && window.location.pathname === "/checkout";
        const isPixCreate = /checkout-create-pix|\/api\/pix\/create/.test(rawUrl);
        if (payingCardOnCheckout && isPixCreate) {
          return new Response(JSON.stringify({ success: false, error: "Pagamento por cartão em andamento" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }

        let pixInit = init;
        if (isPixCreate && !payingCardOnCheckout) {
          pixInit = enrichPixCreateInit(init);
        }

        const fn = rawUrl.match(/\/functions\/v1\/([^/?]+)/);
        if (fn?.[1] && FUNCTION_MAP[fn[1]]) {
          return originalFetch(FUNCTION_MAP[fn[1]], pixInit);
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
          const response = await originalFetch(nextUrl, { ...init, headers });
          return nextUrl.includes("/rest/v1/orders") ? safeOrdersResponse(response) : response;
        }

        return originalFetch(input, pixInit);
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
      // Os dois scripts se guardam por rota. Carregar sempre é o que faz eles
      // funcionarem quando o cliente chega no checkout navegando pela loja.
      script.addEventListener("load", () => {
        for (const name of ["admin-enhancements", "checkout-payment-enhancements"]) {
          const enhancement = document.createElement("script");
          enhancement.type = "module";
          enhancement.src = `/${name}.js?v=${ENHANCEMENTS_VERSION}`;
          document.body.appendChild(enhancement);
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
