import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { withRequestEnv } from "../lib/store/env";

interface Env {
  ASSETS: Fetcher;
  PIX_RATELIMIT?: KVNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function wantsHtml(request: Request) {
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) return true;
  return accept.includes("*/*") && !accept.includes("application/json");
}

function isStaticAssetPath(pathname: string) {
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_vinext/")) return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

function usesVinextApp(pathname: string) {
  if (pathname === "/admin" || pathname === "/admin/") return true;
  if (pathname.startsWith("/rastrear-pedido")) return true;
  if (pathname === "/sucesso" || pathname.startsWith("/sucesso/")) return true;
  return false;
}

function staticHtmlShell(pathname: string) {
  if (pathname === "/painel" || pathname === "/painel/") return "/admin-panel.html";
  if (!usesVinextApp(pathname)) return "/storefront-shell.html";
  return null;
}

async function serveStaticHtml(env: Env, request: Request, shellPath: string) {
  const asset = await env.ASSETS.fetch(new Request(new URL(shellPath, request.url), request));
  if (!asset.ok) return null;
  return new Response(asset.body, {
    status: asset.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!isStaticAssetPath(url.pathname) && wantsHtml(request)) {
      if (url.pathname === "/xxx" || url.pathname.startsWith("/xxx/")) {
        return Response.redirect(new URL("/admin", request.url).toString(), 302);
      }

      if (url.pathname === "/admin/login" || url.pathname === "/admin/login/" || url.pathname === "/login" || url.pathname === "/login/") {
        return Response.redirect(new URL("/painel", request.url).toString(), 302);
      }

      const shell = staticHtmlShell(url.pathname);
      if (shell) {
        const html = await serveStaticHtml(env, request, shell);
        if (html) return html;
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return withRequestEnv(env, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
