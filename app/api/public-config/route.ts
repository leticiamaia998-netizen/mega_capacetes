import { getEnv } from "@/lib/store/env";
import { json, options } from "@/lib/store/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function GET() {
  return json({
    supabaseUrl: (getEnv("VITE_SUPABASE_URL") || getEnv("SUPABASE_URL")).replace(/\/$/, ""),
    supabaseAnonKey: getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("SUPABASE_ANON_KEY"),
  });
}
