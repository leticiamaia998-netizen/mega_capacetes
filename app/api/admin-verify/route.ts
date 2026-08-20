import { readBearer, verifyAdminToken } from "@/lib/store/admin-auth";
import { json, options } from "@/lib/store/http";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const ok = await verifyAdminToken(readBearer(request));
  return json({ success: ok, valid: ok }, ok ? 200 : 401);
}
