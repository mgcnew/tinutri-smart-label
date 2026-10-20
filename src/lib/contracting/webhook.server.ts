import { offerDb, signatureAvailable, signatureEnvironment } from "./store.server";
import { signedPdf } from "./clicksign.server";
import { signatureWebhookHandler } from "./webhook-handler.server";
import type { Offer } from "./domain";

export const receiveClicksign = signatureWebhookHandler({
  enabled: signatureAvailable,
  environment: signatureEnvironment,
  secret: () => process.env.CLICKSIGN_WEBHOOK_SECRET ?? "",
  findOffer: async (documentId) => {
    const { data, error } = await offerDb
      .from("contract_offers")
      .select("*")
      .eq("provider_document_id", documentId)
      .maybeSingle();
    if (error) throw new Error("Database unavailable");
    return data as Offer | null;
  },
  recordReceipt: async (offer, signerId, hash) => {
    const { error } = await offerDb
      .from("contract_signature_receipts")
      .upsert(
        { offer_id: offer.id, signer_id: signerId, event_sha256: hash },
        { onConflict: "offer_id,signer_id", ignoreDuplicates: true },
      );
    if (error) throw new Error("Receipt unavailable");
  },
  receiptCount: async (offer) => {
    const { count, error } = await offerDb
      .from("contract_signature_receipts")
      .select("signer_id", { count: "exact", head: true })
      .eq("offer_id", offer.id)
      .in("signer_id", [offer.provider_signer_id, offer.provider_company_signer_id]);
    if (error || count === null) throw new Error("Receipts unavailable");
    return count;
  },
  signedPdf,
  complete: async (offer, pdf, digest) => {
    const path = `${offer.id}/signed/${digest}.pdf`;
    const { error: uploadError } = await offerDb.storage
      .from("contract-documents")
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (
      uploadError &&
      String(uploadError.statusCode) !== "409" &&
      !/already exists/i.test(uploadError.message)
    )
      throw new Error("Artifact unavailable");
    const { error } = await offerDb.rpc("complete_contract_signature", {
      p_offer: offer.id,
      p_path: path,
      p_sha256: digest,
    });
    if (error) throw new Error("Completion unavailable");
  },
  interrupt: async (offer, reason, digest) => {
    const { error } = await offerDb.rpc("interrupt_contract_signature", {
      p_offer: offer.id,
      p_reason: reason,
      p_event_hash: digest,
    });
    if (error) throw new Error("Interruption unavailable");
  },
});
