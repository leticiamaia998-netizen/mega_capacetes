(function () {
  const APP_SCRIPT_ID = "stormzx-storefront-script";
  const ENHANCEMENTS_VERSION = "33";

  const FUNCTION_MAP = {
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

  const ADMIN_STATUS = ["pending", "paid", "cancelled", "refunded"];
  const ADMIN_REST_TABLES = new Set([
    "orders",
    "user_roles",
    "notifications",
    "payment_gateways",
    "price_overrides",
    "pix_errors",
    "rastreio_origem",
    "orders_status",
  ]);
  const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";

  function normalizeStatus(raw) {
    const value = String(raw || "").toLowerCase();
    if (ADMIN_STATUS.includes(value)) return value;
    if (["pago", "approved", "aprovado", "completed", "authorized"].includes(value)) return "paid";
    if (["canceled", "cancelado", "expired", "expirado"].includes(value)) return "cancelled";
    if (["reembolsado", "estornado", "chargeback"].includes(value)) return "refunded";
    return "pending";
  }

  async function safeOrdersResponse(response) {
    if (!(response.headers.get("content-type") || "").includes("application/json")) return response;
    try {
      const rows = await response.clone().json();
      if (!Array.isArray(rows)) return response;
      let changed = false;
      const safe = rows.map((row) => {
        if (!row || typeof row !== "object") return row;
        const next = { ...row };
        if ("status" in next) {
          const normalized = normalizeStatus(next.status);
          if (normalized !== next.status) {
            next.status_detalhe = next.status_detalhe ?? next.status;
            next.status = normalized;
            changed = true;
          }
        }
        if (next.total_amount == null && next.valor != null) {
          next.total_amount = next.valor;
          changed = true;
        }
        for (const field of ["total_amount", "valor"]) {
          if (field in next && next[field] == null) {
            next[field] = 0;
            changed = true;
          }
        }
        if (!next.customer || typeof next.customer !== "object") {
          next.customer = {
            full_name: next.nome,
            name: next.nome,
            email: next.email,
            phone: next.telefone,
            cpf: next.cpf,
          };
          changed = true;
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
      if (snap && typeof snap === "object") return snap;
    } catch {
      /* ignore */
    }
    try {
      const pix = JSON.parse(sessionStorage.getItem("pixPageState") || "null");
      if (pix && typeof pix === "object") return pix;
    } catch {
      /* ignore */
    }
    return {};
  }

  function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function readCartItems() {
    try {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      if (!Array.isArray(cart)) return [];
      return cart
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: item.id,
          name: item.name || "Produto",
          image: item.image || "",
          price: Number(item.price) || 0,
          originalPrice: Number(item.originalPrice) || Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          size: item.size || "Único",
        }));
    } catch {
      return [];
    }
  }

  function itemsLookGeneric(items) {
    if (!items.length) return true;
    return items.every((item) => !item.image && (!item.name || item.name === "Pedido"));
  }

  function enrichPixCreateInit(init) {
    if (!init?.body || typeof init.body !== "string") return init;
    try {
      const parsed = JSON.parse(init.body);
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
      const cartItems = readCartItems();
      const items = !itemsLookGeneric(parsedItems)
        ? parsedItems
        : !itemsLookGeneric(snapItems)
          ? snapItems
          : cartItems.length
            ? cartItems
            : [{ name: "Pedido", quantity: 1, price: amount }];
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

  function jwtRole(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return String(payload.role || "");
    } catch {
      return "";
    }
  }

  function readAdminToken() {
    try {
      return localStorage.getItem("mcAdminToken") || "";
    } catch {
      return "";
    }
  }

  function adminUserEmail() {
    try {
      const name = localStorage.getItem("mcAdminUser") || "admin";
      return name.includes("@") ? name : `${name}@admin.local`;
    } catch {
      return "admin@admin.local";
    }
  }

  function fakeAdminUser() {
    return {
      id: ADMIN_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: adminUserEmail(),
      app_metadata: { provider: "email" },
      user_metadata: {},
    };
  }

  function fakeJwt() {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const payload = btoa(
      JSON.stringify({
        aud: "authenticated",
        role: "authenticated",
        sub: ADMIN_USER_ID,
        email: adminUserEmail(),
        iat: now,
        exp: now + 8 * 3600,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return `${header}.${payload}.mcadmin`;
  }

  function injectAdminSession() {
    if (!readAdminToken()) return;
    const session = {
      access_token: fakeJwt(),
      refresh_token: "mc-admin-refresh",
      expires_in: 28800,
      expires_at: Math.floor(Date.now() / 1000) + 28800,
      token_type: "bearer",
      user: fakeAdminUser(),
    };
    for (const key of Object.keys(localStorage).filter((k) => k.includes("auth-token"))) {
      localStorage.setItem(key, JSON.stringify(session));
    }
  }

  function reportCrash(detail) {
    window.setTimeout(() => {
      const root = document.getElementById("root");
      if (!root || root.childElementCount > 0) return;
      root.innerHTML = "";
      const box = document.createElement("main");
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

  async function setupFetchPatch(originalFetch, target, anon) {
    window.__mcNativeFetch = originalFetch;
    const OriginalWebSocket = window.WebSocket;

    window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let pixInit = init;

      const payingCardOnCheckout = window.__mcCardMode && window.location.pathname === "/checkout";
      const isPixCreate = /checkout-create-pix|\/api\/pix\/create/.test(rawUrl);
      if (payingCardOnCheckout && isPixCreate) {
        return new Response(JSON.stringify({ success: false, error: "Pagamento por cartão em andamento" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (isPixCreate && !payingCardOnCheckout) {
        pixInit = enrichPixCreateInit(init);
      }

      const hmac = readAdminToken();
      if (hmac && /\/auth\/v1\/user(?:\?|$)/.test(rawUrl)) {
        return new Response(JSON.stringify(fakeAdminUser()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const fn = rawUrl.match(/\/functions\/v1\/([^/?]+)/);
      if (fn?.[1] && FUNCTION_MAP[fn[1]]) {
        return originalFetch(FUNCTION_MAP[fn[1]], pixInit);
      }

      if (target && rawUrl.includes(".supabase.co")) {
        const nextUrl = rawUrl.replace(/https:\/\/[^/]+\.supabase\.co/i, target);
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
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

      if (hmac && /\/api\/admin(?:-gateways|-login|-verify|-rest)?(?:\/|$|\?)/.test(rawUrl)) {
        const headers = new Headers(pixInit?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.get("Authorization")) headers.set("Authorization", `Bearer ${hmac}`);
        pixInit = { ...pixInit, headers };
      }

      return originalFetch(input, pixInit);
    };

    window.WebSocket = function PatchedWebSocket(url, protocols) {
      let next = String(url);
      if (target && next.includes(".supabase.co")) {
        const wsTarget = target.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
        next = next.replace(/wss:\/\/[^/]+\.supabase\.co/i, wsTarget);
        if (anon) next = next.replace(/apikey=[^&]+/, `apikey=${encodeURIComponent(anon)}`);
      }
      return new OriginalWebSocket(next, protocols);
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(window.WebSocket, OriginalWebSocket);
  }

  function loadSpa() {
    if (document.getElementById(APP_SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = APP_SCRIPT_ID;
    script.type = "module";
    script.src = `/assets/index-D36WQRm9.js?v=${ENHANCEMENTS_VERSION}`;
    script.addEventListener("error", () => reportCrash("Não foi possível carregar a loja. Atualize a página."), {
      once: true,
    });
    script.addEventListener(
      "load",
      () => {
        const adminEnhancement = document.createElement("script");
        adminEnhancement.type = "module";
        adminEnhancement.src = `/admin-enhancements.js?v=${ENHANCEMENTS_VERSION}`;
        document.body.appendChild(adminEnhancement);
      },
      { once: true },
    );
    document.body.appendChild(script);
  }

  async function boot() {
    injectAdminSession();

    if (typeof window.crypto.randomUUID !== "function") {
      Object.defineProperty(window.crypto, "randomUUID", {
        configurable: true,
        value: () => {
          const bytes = window.crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6] & 0x0f) | 0x40;
          bytes[8] = (bytes[8] & 0x3f) | 0x80;
          const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
          return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
        },
      });
    }

    window.addEventListener("error", (event) => reportCrash(event.message));
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      reportCrash(typeof reason === "string" ? reason : reason?.message || "");
    });

    const originalFetch = window.fetch.bind(window);
    const cfg = await originalFetch("/api/public-config")
      .then((res) => res.json())
      .catch(() => ({ supabaseUrl: "", supabaseAnonKey: "" }));

    await setupFetchPatch(
      originalFetch,
      String(cfg.supabaseUrl || "").replace(/\/$/, ""),
      String(cfg.supabaseAnonKey || ""),
    );

    const cardEnhancement = document.createElement("script");
    cardEnhancement.src = `/checkout-payment-enhancements.js?v=${ENHANCEMENTS_VERSION}`;
    cardEnhancement.addEventListener("load", loadSpa, { once: true });
    cardEnhancement.addEventListener("error", loadSpa, { once: true });
    document.body.appendChild(cardEnhancement);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
