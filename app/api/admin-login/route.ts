import { adminCredentialsOk, adminEnvConfigured, createAdminToken } from "@/lib/store/admin-auth";
import { json, options, readJson } from "@/lib/store/http";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ user?: string; username?: string; pass?: string; password?: string }>(request);
    const user = String(body.user || body.username || "");
    const pass = String(body.pass || body.password || "");
    if (!adminEnvConfigured()) {
      return json(
        {
          success: false,
          error:
            "ADMIN_USER e ADMIN_PASS não estão visíveis neste Worker. Confira no Cloudflare: Worker mega-capacetes → Settings → Variables and Secrets.",
        },
        500,
      );
    }
    if (!adminCredentialsOk(user, pass)) {
      return json({ success: false, error: "Usuário ou senha inválidos" }, 401);
    }
    const token = await createAdminToken();
    return json({ success: true, token, expiresInHours: 8 });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro no login" }, 500);
  }
}
