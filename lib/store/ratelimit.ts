import { getKv } from "./env";
import { clientIp } from "./http";

const LIMIT = 5;
const TTL = 3600;

export async function assertPixRateLimit(request: Request) {
  const kv = getKv();
  const ip = clientIp(request);
  const key = `ratelimit:pix:${ip}`;

  if (!kv) return { ok: true, remaining: LIMIT, ip };

  const current = Number((await kv.get(key)) || "0");
  if (current >= LIMIT) {
    return { ok: false, remaining: 0, ip };
  }

  await kv.put(key, String(current + 1), { expirationTtl: TTL });
  return { ok: true, remaining: LIMIT - current - 1, ip };
}
