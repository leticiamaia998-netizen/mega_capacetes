import { AsyncLocalStorage } from "node:async_hooks";

type WorkerEnv = {
  PIX_RATELIMIT?: KVNamespace;
  [key: string]: unknown;
};

const requestEnv = new AsyncLocalStorage<WorkerEnv>();

export function withRequestEnv<T>(env: WorkerEnv, run: () => T) {
  return requestEnv.run(env, run);
}

function workersEnv(): WorkerEnv {
  const fromRequest = requestEnv.getStore();
  if (fromRequest && typeof fromRequest === "object") return fromRequest;

  try {
    const processWithBuiltins = process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => { env?: WorkerEnv } | undefined;
    };
    const fromWorkerd = processWithBuiltins.getBuiltinModule?.("cloudflare:workers")?.env;
    if (fromWorkerd && typeof fromWorkerd === "object") return fromWorkerd;
  } catch {
    // Node.js (validação do build) não resolve o módulo cloudflare:workers.
  }
  return {};
}

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function getEnv(name: string, fallback = "") {
  const env = workersEnv();
  const aliases: Record<string, string[]> = {
    ADMIN_USER: ["ADMIN_USER", "ADMIN_USERNAME", "ADMIN_LOGIN"],
    ADMIN_PASS: ["ADMIN_PASS", "ADMIN_PASSWORD", "ADMIN_SENHA"],
  };
  const keys = aliases[name] || [name];
  for (const key of keys) {
    const fromCf = asText(env[key]).trim();
    if (fromCf) return fromCf;
    const fromProcess = String(process.env[key] || "").trim();
    if (fromProcess) return fromProcess;
  }
  return fallback;
}

export function getKv(): KVNamespace | null {
  return workersEnv().PIX_RATELIMIT ?? null;
}

export const STORE = {
  name: "Mega Capacetes",
  domain: "megacapacetes.store",
  trackingPrefix: "MC",
  siteUrl() {
    return getEnv("SITE_URL", "https://megacapacetes.store").replace(/\/$/, "");
  },
};
