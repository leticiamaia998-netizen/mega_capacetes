import { json, options, readJson } from "@/lib/store/http";
import { sbInsert } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ tracking_code?: string; file_url?: string; file_name?: string }>(request);
    if (!body.tracking_code || !body.file_url) {
      return json({ success: false, error: "tracking_code e file_url são obrigatórios" }, 400);
    }
    const row = await sbInsert("comprovantes_taxa", {
      tracking_code: body.tracking_code.toUpperCase(),
      file_url: body.file_url,
      file_name: body.file_name || null,
    });
    return json({ success: true, comprovante: row });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro ao salvar comprovante" }, 500);
  }
}
