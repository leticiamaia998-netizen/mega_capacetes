import { AsyncLocalStorage } from "node:async_hooks";

type WorkerEnv = {
  PIX_RATELIMIT?: KVNamespace;
  [key: string]: unknown;
};

const requestEnv = new AsyncLocalStorage<WorkerEnv>();

export function withRequestEnv<T>(env: WorkerEnv, run: () => T) {
  return requestEnv.run(env, run);
}

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function readWorkerdEnv(): WorkerEnv {
  try {
    const processWithBuiltins = process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => { env?: WorkerEnv } | undefined;
    };
    const fromWorkerd = processWithBuiltins.getBuiltinModule?.("cloudflare:workers")?.env;
    if (fromWorkerd && typeof fromWorkerd === "object") return fromWorkerd;
  } catch {
    // Node.js (validação do build) não resolve o módulo cloudflare:workers.
  }
  try {
    const required = (0, eval)("require") as ((id: string) => { env?: WorkerEnv }) | undefined;
    const fromRequire = required?.("cloudflare:workers")?.env;
    if (fromRequire && typeof fromRequire === "object") return fromRequire;
  } catch {
    // bundle ESM sem require
  }
  return {};
}

function envSources(): WorkerEnv[] {
  const sources: WorkerEnv[] = [];
  const fromWorkerd = readWorkerdEnv();
  sources.push(fromWorkerd);
  const fromRequest = requestEnv.getStore();
  if (fromRequest && fromRequest !== fromWorkerd) sources.push(fromRequest);
  const fromGlobal = (globalThis as { env?: WorkerEnv }).env;
  if (fromGlobal && fromGlobal !== fromWorkerd && fromGlobal !== fromRequest) sources.push(fromGlobal);
  sources.push(process.env as unknown as WorkerEnv);
  return sources;
}

export function getEnv(name: string, fallback = "") {
  const aliases: Record<string, string[]> = {
    ADMIN_USER: ["ADMIN_USER", "ADMIN_USERNAME", "ADMIN_LOGIN"],
    ADMIN_PASS: ["ADMIN_PASS", "ADMIN_PASSWORD", "ADMIN_SENHA"],
    ADMIN_SESSION_SECRET: ["ADMIN_SESSION_SECRET", "ADMIN_SECRET", "SESSION_SECRET"],
  };
  const keys = aliases[name] || [name];
  for (const source of envSources()) {
    for (const key of keys) {
      const value = asText(source[key]).trim();
      if (value) return value;
    }
  }
  return fallback;
}

export function getKv(): KVNamespace | null {
  return requestEnv.getStore()?.PIX_RATELIMIT ?? readWorkerdEnv().PIX_RATELIMIT ?? null;
}

export const STORE = {
  name: "Mega Capacetes",
  domain: "megacapacetes.store",
  trackingPrefix: "MC",
  siteUrl() {
    return getEnv("SITE_URL", "https://megacapacetes.store").replace(/\/$/, "");
  },
};
