import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyClicksignHmac } from "./webhook-auth.server.ts";
import type { Offer, SignatureIssue } from "./domain.ts";

export type SignatureWebhookPorts = {
  enabled: () => boolean;
  environment: () => "sandbox" | "production";
  secret: () => string;
  findOffer: (documentId: string) => Promise<Offer | null>;
  recordReceipt: (offer: Offer, signerId: string, digest: string) => Promise<void>;
  receiptCount: (offer: Offer) => Promise<number>;
  signedPdf: (offer: Offer) => Promise<Uint8Array>;
  complete: (offer: Offer, pdf: Uint8Array, digest: string) => Promise<void>;
  interrupt: (
    offer: Offer,
    reason: Exclude<SignatureIssue, "delivery_failed">,
    digest: string,
  ) => Promise<void>;
};
const envelopeSchema = z.object({
  event: z.object({ name: z.string(), data: z.unknown().optional() }),
  document: z.object({ key: z.string().uuid() }),
});
const actorSchema = z.object({
  signer: z.object({ key: z.string().uuid(), email: z.string().email() }),
});
const digest = (raw: Uint8Array) => createHash("sha256").update(raw).digest("hex");
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1024 * 1024) throw new Error("large");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
/** Ports keep the real HTTP/HMAC/state flow testable without database or provider accounts. */
export function signatureWebhookHandler(ports: SignatureWebhookPorts) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
    const reply = (status: number, message: string) =>
      new Response(JSON.stringify({ message }), { status, headers });
    if (!ports.enabled()) return reply(503, "Signature integration unavailable");
    let raw: Uint8Array;
    try {
      raw = await readBody(request);
    } catch {
      return reply(413, "Invalid payload size");
    }
    if (!verifyClicksignHmac(raw, request.headers.get("content-hmac"), ports.secret()))
      return reply(401, "Invalid signature");
    let parsed: z.infer<typeof envelopeSchema>;
    try {
      parsed = envelopeSchema.parse(JSON.parse(Buffer.from(raw).toString("utf8")));
    } catch {
      return reply(422, "Unsupported event format");
    }
    const issue =
      parsed.event.name === "refusal"
        ? "refused"
        : parsed.event.name === "cancel"
          ? "canceled"
          : parsed.event.name === "deadline"
            ? "deadline"
            : null;
    if (!issue && !["sign", "document_closed", "auto_close"].includes(parsed.event.name))
      return reply(200, "Ignored");
    try {
      const offer = await ports.findOffer(parsed.document.key);
      if (!offer) return reply(200, "Unrelated document");
      if (offer.revoked_at || offer.signature_status === "signed")
        return reply(200, "Already handled");
      if (offer.signature_environment !== ports.environment())
        return reply(409, "Environment mismatch");
      if (offer.signature_issue && offer.signature_issue !== "delivery_failed")
        return reply(200, "Signature interrupted");
      if (issue) {
        await ports.interrupt(offer, issue, digest(raw));
        return reply(200, "Signature interrupted");
      }
      if (parsed.event.name === "sign") {
        const actor = actorSchema.safeParse(parsed.event.data);
        if (!actor.success) return reply(422, "Unsupported signer format");
        const { key, email } = actor.data.signer;
        const expected =
          key === offer.provider_signer_id
            ? offer.signer.email
            : key === offer.provider_company_signer_id
              ? offer.provider_signer.email
              : null;
        if (!expected || expected.toLowerCase() !== email.toLowerCase())
          return reply(422, "Unexpected signer");
        await ports.recordReceipt(offer, key, digest(raw));
      }
      if ((await ports.receiptCount(offer)) !== 2) return reply(200, "Waiting for signatures");
      const pdf = await ports.signedPdf(offer);
      await ports.complete(offer, pdf, digest(pdf));
      return reply(200, "Received");
    } catch {
      return reply(503, "Signature processing pending; retry delivery");
    }
  };
}
