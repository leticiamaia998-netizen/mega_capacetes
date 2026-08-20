type WorkerEnv = {
  PIX_RATELIMIT?: KVNamespace;
  [key: string]: unknown;
};

function workersEnv(): WorkerEnv {
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

export function getEnv(name: string, fallback = ""): string {
  const fromCf = workersEnv()[name];
  if (typeof fromCf === "string" && fromCf.length > 0) return fromCf;
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.length > 0) return fromProcess;
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
