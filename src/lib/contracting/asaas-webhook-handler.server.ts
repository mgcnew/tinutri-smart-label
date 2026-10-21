import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AsaasApiError, billingTypes, type AsaasPayment } from "./asaas.server.ts";
import type { Offer } from "./domain";

export type PaymentBinding = {
  offer_id: string;
  account_id: string;
  customer_id: string;
  payment_id: string;
};
export interface AsaasWebhookPorts {
  binding(paymentId: string): Promise<PaymentBinding | null>;
  wallet(): Promise<string>;
  payment(id: string): Promise<AsaasPayment>;
  offer(id: string): Promise<Offer>;
  confirm(offer: Offer, binding: PaymentBinding, eventId: string): Promise<void>;
  invalidate(offerId: string, paymentId: string): Promise<void>;
}
const confirmationEvents = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const reversalEvents = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DELETED",
]);
export const asaasEventSchema = z.object({
  id: z.string().min(1).max(200),
  event: z.string().max(100),
  payment: z.object({
    id: z.string().regex(/^pay_[A-Za-z0-9_-]+$/),
    externalReference: z.string().max(500).nullable().optional(),
  }),
});
const reply = (status: number, state: string) =>
  Response.json(
    { state },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
export type AsaasWebhookEvent = z.infer<typeof asaasEventSchema>;
export const supportedAsaasEvent = (name: string) =>
  confirmationEvents.has(name) || reversalEvents.has(name);
export async function readAsaasWebhook(
  request: Request,
  token: string | undefined,
): Promise<AsaasWebhookEvent | Response> {
  if (!token || token.length < 32) return reply(503, "unconfigured");
  const supplied = request.headers.get("asaas-access-token") || "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(token), digest(supplied)))
    return reply(401, "unauthorized");
  let payload: z.infer<typeof asaasEventSchema>;
  try {
    if (Number(request.headers.get("content-length")) > 1024 * 1024) return reply(413, "too_large");
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "invalid");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        return reply(413, "too_large");
      }
      chunks.push(part.value);
    }
    payload = asaasEventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return reply(400, "invalid");
  }
  return payload;
}
export async function handleAsaasWebhook(
  request: Request,
  token: string | undefined,
  ports: AsaasWebhookPorts,
) {
  const payload = await readAsaasWebhook(request, token);
  if (payload instanceof Response) return payload;
  return handleAsaasEvent(payload, ports);
}
export async function handleAsaasEvent(payload: AsaasWebhookEvent, ports: AsaasWebhookPorts) {
  if (!confirmationEvents.has(payload.event) && !reversalEvents.has(payload.event))
    return reply(200, "ignored");
  try {
    const binding = await ports.binding(payload.payment.id);
    // Outros pagamentos da conta não pertencem ao TiNutri. O prefixo próprio aguarda persistência local.
    if (!binding)
      return payload.payment.externalReference?.startsWith("tinutri:")
        ? reply(503, "binding_pending")
        : reply(200, "ignored");
    return await verifyBoundAsaasPayment(
      binding,
      ports,
      payload.id,
      confirmationEvents.has(payload.event),
    );
  } catch {
    return reply(503, "retry");
  }
}

/** Shared verification for authenticated provider callbacks and authenticated Master reconciliation. */
export async function verifyBoundAsaasPayment(
  binding: PaymentBinding,
  ports: AsaasWebhookPorts,
  eventId: string,
  allowConfirmation = true,
): Promise<Response> {
  if (binding.account_id !== (await ports.wallet())) return reply(409, "account_mismatch");
  const offer = await ports.offer(binding.offer_id);
  if (binding.offer_id !== offer.id || offer.signature_environment !== "sandbox")
    return reply(409, "payment_mismatch");
  let payment: AsaasPayment;
  try {
    payment = await ports.payment(binding.payment_id);
  } catch (error) {
    // A known charge unavailable in the verified account cannot keep a valid financial proof.
    if (error instanceof AsaasApiError && error.status === 404) {
      await ports.invalidate(offer.id, binding.payment_id);
      return reply(200, "invalidated");
    }
    throw error;
  }
  if (
    binding.offer_id !== offer.id ||
    payment.id !== binding.payment_id ||
    payment.customer !== binding.customer_id ||
    payment.externalReference !== `tinutri:${offer.id}` ||
    offer.signature_environment !== "sandbox" ||
    payment.billingType !== billingTypes[offer.commercial.payment]
  )
    return reply(409, "payment_mismatch");
  // O estado consultado na API prevalece sobre o evento, inclusive em entregas fora de ordem.
  if (
    payment.deleted ||
    /REFUND|CHARGEBACK/.test(payment.status) ||
    payment.refunds?.some(
      (refund) => refund.value > 0 && (refund.status === "DONE" || refund.status === "PENDING"),
    )
  ) {
    await ports.invalidate(offer.id, payment.id);
    return reply(200, "invalidated");
  }
  if (payment.refunds?.some((refund) => refund.value > 0 && refund.status !== "CANCELLED"))
    return reply(409, "payment_mismatch");
  if (Math.abs(payment.value * 100 - offer.commercial.plan.total_cents) > 0.000001)
    return reply(409, "payment_mismatch");
  if (!allowConfirmation || !["CONFIRMED", "RECEIVED"].includes(payment.status))
    return reply(200, "waiting");
  if (offer.revoked_at || offer.payment_status === "refunded") return reply(200, "ignored");
  if (offer.signature_status !== "signed" || !offer.signed_file_path || offer.signature_issue)
    return reply(409, "signature_required");
  await ports.confirm(offer, binding, eventId);
  return reply(200, "confirmed_sandbox");
}
