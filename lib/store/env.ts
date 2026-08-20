import { env } from "cloudflare:workers";

type WorkerEnv = {
  PIX_RATELIMIT?: KVNamespace;
  [key: string]: unknown;
};

const cfEnv = env as unknown as WorkerEnv;

export function getEnv(name: string, fallback = ""): string {
  const fromCf = cfEnv[name];
  if (typeof fromCf === "string" && fromCf.length > 0) return fromCf;
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.length > 0) return fromProcess;
  return fallback;
}

export function getKv(): KVNamespace | null {
  return cfEnv.PIX_RATELIMIT ?? null;
}

export const STORE = {
  name: "Mega Capacetes",
  domain: "megacapacetes.store",
  trackingPrefix: "MC",
  siteUrl() {
    return getEnv("SITE_URL", "https://megacapacetes.store").replace(/\/$/, "");
  },
};
