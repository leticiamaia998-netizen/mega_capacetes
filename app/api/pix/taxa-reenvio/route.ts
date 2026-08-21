import { createOrReusePixOrder, generatePixForOrder } from "@/lib/store/checkout";
import { gatewayCode } from "@/lib/store/gateways";
import { json, options, readJson } from "@/lib/store/http";
import { findRastreio, TAXA_REENVIO_VALOR } from "@/lib/store/tracking";
import { sbSelect, type OrderRow } from "@/lib/store/supabase";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      codigoRastreio?: string;
      nome?: string;
      email?: string;
    }>(request);

    const codigo = String(body.codigoRastreio || "")
      .trim()
      .toUpperCase();
    if (!codigo) {
      return json({ success: false, error: "codigoRastreio é obrigatório" }, 400);
    }

    const origem = await findRastreio(codigo);
    if (!origem) {
      return json({ success: false, error: "Código de rastreio não encontrado" }, 404);
    }

    let nome = body.nome || String(origem.nome_cliente || "Cliente");
    let email = body.email || "";

    if (!email && origem.order_id) {
      const order = (await sbSelect<OrderRow>("orders", `id=eq.${origem.order_id}&select=email,nome`))[0];
      email = order?.email || "";
      if (!body.nome && order?.nome) nome = order.nome;
    }

    if (!email) {
      email = `taxa.${codigo.toLowerCase()}@noreply.megacapacetes.store`;
    }

    const payload = {
      amount: TAXA_REENVIO_VALOR,
      customer: { name: nome, email },
      items: [{ name: `Taxa de Reenvio — ${codigo}`, quantity: 1, price: TAXA_REENVIO_VALOR }],
      tracking: { tipo: "taxa_reenvio", codigo_rastreio: codigo },
    };

    const { order, gateway, alreadyPaid } = await createOrReusePixOrder(payload);
    if (alreadyPaid) {
      return json({
        success: true,
        alreadyPaid: true,
        pixCode: order.pix_copy_paste || "",
        qrCode: order.pix_qr_code || "",
        copyPaste: order.pix_copy_paste || "",
        qrCodeBase64: order.pix_qr_code || "",
      });
    }

    const pix = await generatePixForOrder(order, payload, gatewayCode(gateway));
    return json({
      success: true,
      pixCode: pix.copyPaste,
      copyPaste: pix.copyPaste,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCode,
      orderId: order.id,
    });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao gerar PIX da taxa" },
      500,
    );
  }
}
