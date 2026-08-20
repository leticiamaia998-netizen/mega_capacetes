import { json, options } from "@/lib/store/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  return json({
    ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    city: request.headers.get("cf-ipcity"),
    region: request.headers.get("cf-region"),
    country: null,
    countryCode: request.headers.get("cf-ipcountry"),
    lat: null,
    lon: null,
    timezone: request.headers.get("cf-timezone"),
    isp: null,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
