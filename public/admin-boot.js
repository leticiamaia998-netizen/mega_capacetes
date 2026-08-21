(function () {
  const APP_SCRIPT_ID = "stormzx-storefront-script";
  const ENHANCEMENTS_VERSION = "29";
  const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
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
    const hmac = readAdminToken();
    if (!hmac) return;
    const access = fakeJwt();
    const user = fakeAdminUser();
    const session = {
      access_token: access,
      refresh_token: "mc-admin-refresh",
      expires_in: 28800,
      expires_at: Math.floor(Date.now() / 1000) + 28800,
      token_type: "bearer",
      user,
    };
    const keys = new Set([
      "sb-qjsjexpmkctyusukxwgm-auth-token",
      "sb-qjsexpmkctyusukxwgm-auth-token",
      "mcAdminSession",
      ...Object.keys(localStorage).filter((key) => key.includes("auth-token")),
    ]);
    for (const key of keys) localStorage.setItem(key, JSON.stringify(session));
  }

  async function mapAdminTableResponse(table, response) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) return response;
    try {
      const payload = await response.clone().json();
      const asArray = Array.isArray(payload);
      const rows = asArray ? payload : payload ? [payload] : [];
      const mapped = rows.map((row) => {
        if (table === "payment_gateways") {
          return {
            ...row,
            name: row.name || row.nome || row.id,
            gateway_type: row.gateway_type || row.method || "pix",
            is_active: row.is_active ?? row.enabled ?? false,
            is_default: row.is_default ?? false,
          };
        }
        return {
          ...row,
          title: row.title || row.titulo || "",
          message: row.message || row.mensagem || "",
          is_read: row.is_read ?? row.lida ?? false,
        };
      });
      return new Response(JSON.stringify(asArray ? mapped : mapped[0] || null), {
        status: response.status,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  }

  function showError(message) {
    const root = document.getElementById("root");
    if (!root) return;
    root.innerHTML = "";
    const box = document.createElement("main");
    box.style.cssText =
      "min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#09090b;color:#fff;text-align:center;font-family:system-ui,sans-serif;";
    const title = document.createElement("p");
    title.style.cssText = "font-size:16px;font-weight:700;margin:0;";
    title.textContent = "Não foi possível abrir o painel.";
    const detail = document.createElement("p");
    detail.style.cssText = "font-size:13px;color:#a1a1aa;max-width:520px;margin:0;line-height:1.5;";
    detail.textContent = message || "Erro desconhecido";
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Recarregar";
    reload.style.cssText =
      "height:44px;padding:0 22px;border:0;border-radius:999px;background:#fff;color:#09090b;font-weight:700;cursor:pointer;";
    reload.addEventListener("click", () => window.location.reload());
    box.append(title, detail, reload);
    root.appendChild(box);
  }

  async function setupFetchPatch(originalFetch, target, anon) {
    window.__mcNativeFetch = originalFetch;
    const OriginalWebSocket = window.WebSocket;

    window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let pixInit = init;
      const hmac = readAdminToken();

      if (hmac) {
        if (/\/auth\/v1\/user(?:\?|$)/.test(rawUrl)) {
          return new Response(JSON.stringify(fakeAdminUser()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (/\/auth\/v1\/logout/.test(rawUrl)) {
          localStorage.removeItem("mcAdminToken");
          localStorage.removeItem("mcAdminUser");
          return new Response(null, { status: 204 });
        }
        if (/\/auth\/v1\/token/.test(rawUrl)) {
          return new Response(
            JSON.stringify({
              access_token: fakeJwt(),
              refresh_token: "mc-admin-refresh",
              expires_in: 28800,
              token_type: "bearer",
              user: fakeAdminUser(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        const restTable = rawUrl.match(/\/rest\/v1\/([^/?]+)/)?.[1];
        if (restTable === "user_roles") {
          const accept = String(
            new Headers(pixInit?.headers || (input instanceof Request ? input.headers : undefined)).get("Accept") || "",
          );
          const body = accept.includes("vnd.pgrst.object")
            ? { role: "admin", user_id: ADMIN_USER_ID }
            : [{ role: "admin", user_id: ADMIN_USER_ID }];
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (restTable && ADMIN_REST_TABLES.has(restTable)) {
          const parsed = new URL(rawUrl, window.location.origin);
          if (restTable === "orders") {
            const select = parsed.searchParams.get("select") || "*";
            const extra = ["nome", "email", "telefone", "cpf", "codigo_rastreio", "gateway_id", "metodo_pagamento", "valor"];
            let nextSelect = select;
            for (const col of extra) {
              if (!nextSelect.includes(col)) nextSelect += `,${col}`;
            }
            parsed.searchParams.set("select", nextSelect);
          }
          if (restTable === "payment_gateways") {
            parsed.searchParams.set("select", "id,code,name,nome,method,gateway_type,enabled,is_active,is_default,created_at");
          }
          if (restTable === "notifications") {
            parsed.searchParams.set("select", "*");
          }
          const headers = new Headers(pixInit?.headers || (input instanceof Request ? input.headers : undefined));
          headers.set("Authorization", `Bearer ${hmac}`);
          const proxied = await originalFetch(`/api/admin-rest/${restTable}${parsed.search}`, {
            ...pixInit,
            method: pixInit?.method || (input instanceof Request ? input.method : "GET"),
            headers,
            body: pixInit?.body,
          });
          if (restTable === "orders") return safeOrdersResponse(proxied);
          if (restTable === "payment_gateways" || restTable === "notifications") {
            return mapAdminTableResponse(restTable, proxied);
          }
          return proxied;
        }
      }

      if (hmac && /\/api\/admin(?:-gateways|-login|-verify|-rest)?(?:\/|$|\?)/.test(rawUrl)) {
        const headers = new Headers(pixInit?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.get("Authorization")) headers.set("Authorization", `Bearer ${hmac}`);
        pixInit = { ...pixInit, headers };
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
    const loading = document.getElementById("mc-admin-loading");
    if (loading) loading.remove();
    const root = document.getElementById("root");
    if (root) root.replaceChildren();
    const script = document.createElement("script");
    script.id = APP_SCRIPT_ID;
    script.type = "module";
    script.src = "/assets/index-D36WQRm9.js?v=29";
    script.addEventListener("error", () => showError("Não foi possível carregar o painel. Atualize a página."), {
      once: true,
    });
    script.addEventListener(
      "load",
      () => {
        const enhancement = document.createElement("script");
        enhancement.type = "module";
        enhancement.src = `/admin-enhancements.js?v=${ENHANCEMENTS_VERSION}`;
        document.body.appendChild(enhancement);
      },
      { once: true },
    );
    document.body.appendChild(script);
  }

  async function boot() {
    document.documentElement.dataset.mcAdmin = "1";
    document.documentElement.style.background = "#09090b";
    document.body.style.background = "#09090b";
    document.body.style.color = "#fff";

    if (!/^\/admin\/login(\/|$)/.test(window.location.pathname)) {
      const token = readAdminToken();
      window.location.replace(token ? "/admin/login" : "/admin");
      return;
    }

    const token = readAdminToken();
    if (!token) {
      window.location.replace("/admin");
      return;
    }

    try {
      const verify = await fetch("/api/admin-verify", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json());
      if (!verify?.valid && !verify?.success) {
        localStorage.removeItem("mcAdminToken");
        localStorage.removeItem("mcAdminUser");
        window.location.replace("/admin");
        return;
      }
    } catch {
      /* segue se verify falhar por rede */
    }

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

    window.addEventListener("error", (event) => showError(event.message));
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      showError(typeof reason === "string" ? reason : reason?.message || "");
    });

    const originalFetch = window.fetch.bind(window);
    const cfg = await originalFetch("/api/public-config")
      .then((res) => res.json())
      .catch(() => ({ supabaseUrl: "", supabaseAnonKey: "" }));

    await setupFetchPatch(originalFetch, String(cfg.supabaseUrl || "").replace(/\/$/, ""), String(cfg.supabaseAnonKey || ""));
    await loadSpa();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
