import { sendTrackingEmail } from "@/lib/store/emails";
import { json, options, readJson } from "@/lib/store/http";
import { sbSelect, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string; email?: string; nomeCliente?: string; codigoRastreio?: string }>(request);
    let email = body.email;
    let nomeCliente = body.nomeCliente;
    let codigo = body.codigoRastreio;

    if (body.orderId) {
      const order = (await sbSelect<OrderRow>("orders", `id=eq.${body.orderId}&select=email,nome,codigo_rastreio`))[0];
      if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);
      email = email || order.email || undefined;
      nomeCliente = nomeCliente || order.nome || undefined;
      codigo = codigo || order.codigo_rastreio || undefined;
    }

    if (!email || !codigo) return json({ success: false, error: "email e codigoRastreio são obrigatórios" }, 400);
    const result = await sendTrackingEmail({ email, nomeCliente, codigoRastreio: codigo });
    return json({ success: true, result });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro ao enviar e-mail" }, 500);
  }
}
