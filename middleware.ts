import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function wantsHtml(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  return accept.includes("*/*") && !accept.includes("application/json");
}

function isStaticAsset(pathname: string) {
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isStaticAsset(pathname) || !wantsHtml(request)) {
    return NextResponse.next();
  }

  if (pathname === "/xxx" || pathname.startsWith("/xxx/")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (
    pathname === "/login" ||
    pathname === "/login/" ||
    pathname === "/admin/login" ||
    pathname === "/admin/login/"
  ) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  if (pathname === "/painel" || pathname === "/painel/") {
    return NextResponse.rewrite(new URL("/admin-panel.html", request.url));
  }

  if (!usesVinextApp(pathname)) {
    return NextResponse.rewrite(new URL("/storefront-shell.html", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
