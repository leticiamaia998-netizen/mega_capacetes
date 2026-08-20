import { json, options, readJson } from "@/lib/store/http";
import { assertPixRateLimit } from "@/lib/store/ratelimit";
import { createOrReusePixOrder, generatePixForOrder, type CheckoutPayload } from "@/lib/store/checkout";
import { gatewayCode } from "@/lib/store/gateways";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  try {
    const limited = await assertPixRateLimit(request);
    if (!limited.ok) {
      return json({ success: false, error: "Limite de 5 PIX por hora neste IP. Tente novamente mais tarde." }, 429);
    }

    const payload = await readJson<CheckoutPayload>(request);
    const { order, gateway, alreadyPaid } = await createOrReusePixOrder(payload);
    if (alreadyPaid) {
      return json({
        success: true,
        alreadyPaid: true,
        orderId: order.id,
        qrCode: order.pix_qr_code || "",
        copyPaste: order.pix_copy_paste || "",
        externalId: order.transaction_id || order.id,
        gatewayName: gatewayCode(gateway),
      });
    }

    const pix = await generatePixForOrder(order, payload, gatewayCode(gateway));
    return json({
      success: true,
      alreadyPaid: pix.alreadyPaid,
      qrCode: pix.qrCode,
      copyPaste: pix.copyPaste,
      externalId: pix.externalId,
      orderId: order.id,
      gatewayName: gatewayCode(gateway),
    });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao gerar PIX" },
      500,
    );
  }
}
