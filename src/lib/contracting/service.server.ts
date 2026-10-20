import type { SupabaseClient } from "@supabase/supabase-js";
import {
  commercialSchema,
  emailHint,
  finalContractBody,
  offerStage,
  type Offer,
  type PublicOffer,
  type PublishInput,
  type ActivationSummary,
  type OfferEvent,
} from "./domain";
import {
  event,
  hash,
  loadOffer,
  loadOfferByToken,
  newOfferToken,
  offerDb,
  offerLink,
  patchOffer,
  requireMaster,
  signatureAvailable,
  signatureEnvironment,
} from "./store.server";
import { contractPdf } from "./pdf.server";
import { cancelClicksign, prepareClicksign } from "./clicksign.server";

export async function publish(input: PublishInput, db: SupabaseClient, userId: string) {
  await requireMaster(db, userId);
  const token = newOfferToken();
  const link = offerLink(token); // Validate configuration before persisting a non-recoverable secret.
  const { data: contract, error } = await db
    .from("service_contracts")
    .select("*")
    .eq("id", input.contractId)
    .single();
  if (error || !contract) throw new Error("Não foi possível carregar a minuta.");
  if (contract.status === "arquivada") throw new Error("A minuta está arquivada.");
  const parsed = commercialSchema.safeParse(contract.commercial_snapshot);
  if (!parsed.success)
    throw new Error(
      "Gere uma nova minuta com início na ativação e forma de pagamento definida para contratar por link.",
    );
  if (input.signer.email === input.providerSigner.email)
    throw new Error(
      "Informe e-mails diferentes para os representantes da contratante e da TiNutri.",
    );
  const body = finalContractBody(contract.body);
  // Fail before publishing when PDF cannot faithfully render the frozen text.
  await contractPdf(contract.title, body);
  const { data, error: failed } = await db.rpc("publish_contract_offer", {
    p_contract: input.contractId,
    p_updated: input.updatedAt,
    p_token_hash: hash(token),
    p_body: body,
    p_body_hash: hash(body),
    p_signer: input.signer,
    p_provider_signer: input.providerSigner,
    p_access: input.accessContact,
    p_days: input.expiresDays,
    p_environment: signatureEnvironment(),
  });
  if (failed) {
    if (failed.code === "23505")
      throw new Error(
        "Esta empresa já tem uma contratação em aberto. Abra o contrato correspondente ou revogue a contratação anterior antes de preparar outra.",
      );
    if (failed.code === "PGRST202" || failed.code === "42P01")
      throw new Error("Aplique o SQL 22 de contratação por link neste ambiente.");
    throw new Error(failed.message);
  }
  return { id: data as string, link };
}
export async function list(contractId: string, db: SupabaseClient, userId: string) {
  await requireMaster(db, userId);
  const { data, error } = await db
    .from("contract_offers")
    .select(
      "id,created_at,expires_at,revoked_at,signature_status,signature_issue,payment_status,signature_environment,activated_at,signer,provider_signer,access_contact",
    )
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error)
    throw new Error("Contratação por link indisponível. Confira a aplicação dos SQLs 22 e 23.");
  const rows = (data ?? []) as Pick<
    Offer,
    | "id"
    | "created_at"
    | "expires_at"
    | "revoked_at"
    | "signature_status"
    | "signature_issue"
    | "payment_status"
    | "signature_environment"
    | "activated_at"
    | "signer"
    | "provider_signer"
    | "access_contact"
  >[];
  const ids = rows.map((row) => row.id);
  const [jobs, events, checkouts] = ids.length
    ? await Promise.all([
        db
          .from("contract_activation_jobs")
          .select("offer_id,status,error_code")
          .in("offer_id", ids),
        db
          .from("contract_offer_events")
          .select("offer_id,kind,created_at")
          .in("offer_id", ids)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(100),
        db.from("contract_payment_checkouts").select("offer_id,status").in("offer_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (jobs.error || events.error || checkouts.error)
    throw new Error("Confira a aplicação dos SQLs 22, 23 e 24 para acompanhar a contratação.");
  const { activationAvailable } = await import("./activation.server");
  const { asaasAvailable, asaasConfig } = await import("./asaas.server");
  let paymentCheckAvailable = false;
  try {
    asaasConfig();
    paymentCheckAvailable = true;
  } catch {
    /* Configuração ainda pendente. */
  }
  return {
    offers: rows.map((row) => ({
      ...row,
      activation: ((jobs.data ?? []).find((job) => job.offer_id === row.id) ??
        null) as ActivationSummary | null,
      events: (events.data ?? []).filter((item) => item.offer_id === row.id) as OfferEvent[],
      checkout: ((checkouts.data ?? []).find((item) => item.offer_id === row.id) ?? null) as {
        status: "preparing" | "ready" | "blocked";
      } | null,
    })),
    activationAvailable: activationAvailable(),
    signatureAvailable: signatureAvailable(),
    environment: signatureEnvironment(),
    paymentAvailable: asaasAvailable() && signatureEnvironment() === "sandbox",
    paymentCheckAvailable,
  };
}
export async function manage(
  id: string,
  action: "rotate" | "revoke",
  db: SupabaseClient,
  userId: string,
) {
  await requireMaster(db, userId);
  if (action === "rotate") {
    const token = newOfferToken();
    const link = offerLink(token);
    const { error } = await db.rpc("rotate_contract_offer", {
      p_offer: id,
      p_token_hash: hash(token),
    });
    if (error) throw new Error(error.message);
    return { link };
  }
  const offer = await loadOffer(id);
  if (offer.revoked_at) return { link: null };
  if (offer.payment_status === "confirmed" || offer.activated_at)
    throw new Error("Contratação paga exige o fluxo de cancelamento financeiro.");
  if (offer.signature_status === "preparing")
    throw new Error(
      "A preparação da assinatura está em andamento. Aguarde; em caso de falha, consulte o guia de recuperação.",
    );
  if (
    offer.provider_envelope_id &&
    offer.signature_status !== "signed" &&
    offer.signature_issue !== "canceled" &&
    offer.signature_issue !== "deadline"
  ) {
    if (offer.signature_environment !== signatureEnvironment() || !signatureAvailable())
      throw new Error(
        "Restaure a configuração de assinatura original para cancelar também no provedor.",
      );
    await cancelClicksign(offer);
  }
  const { data: revoked, error: revokeError } = await offerDb
    .from("contract_offers")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", offer.updated_at)
    .neq("signature_status", "preparing")
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (revokeError || !revoked)
    throw new Error(
      "A contratação mudou durante a operação. Atualize a situação antes de revogar.",
    );
  await event(id, "revoked", { actor: userId });
  return { link: null };
}
export async function readPublic(token: string): Promise<PublicOffer> {
  const o = await loadOfferByToken(token);
  return {
    id: o.id,
    title: o.title,
    body: o.body,
    body_sha256: o.body_sha256,
    company_name: o.company_name,
    commercial: o.commercial,
    expires_at: o.expires_at,
    signature_status: o.signature_status,
    signatureIssue: o.signature_issue ?? null,
    payment_status: o.payment_status,
    signature_environment: o.signature_environment,
    signed_at: o.signed_at,
    activated_at: o.activated_at,
    stage: offerStage(o),
    signerName: o.signer.name,
    signerEmailHint: emailHint(o.signer.email),
    signatureAvailable: signatureAvailable() && o.signature_environment === signatureEnvironment(),
    paymentAvailable: (await import("./payment.server")).paymentAvailable(o),
    signedDocumentAvailable: !!o.signed_file_path,
  };
}
export async function begin(token: string) {
  const offer = await loadOfferByToken(token);
  if (!signatureAvailable() || offer.signature_environment !== signatureEnvironment())
    throw new Error(
      "A assinatura eletrônica ainda não está disponível. A TiNutri avisará quando você puder continuar.",
    );
  if (offer.signature_status === "signed" || offer.signature_status === "awaiting")
    return { requested: true };
  if (offer.signature_status !== "pending")
    throw new Error("A solicitação de assinatura está em análise. Entre em contato com a TiNutri.");
  const { data, error } = await offerDb
    .from("contract_offers")
    .update({ signature_status: "preparing" })
    .eq("id", offer.id)
    .eq("signature_status", "pending")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new Error("A assinatura já está sendo preparada. Atualize a página em instantes.");
  try {
    await event(offer.id, "signature_requested");
    const pdf = await contractPdf(offer.title, offer.body);
    const { error: uploadError } = await offerDb.storage
      .from("contract-documents")
      .upload(`${offer.id}/original.pdf`, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error("Não foi possível preservar o documento original.");
    await prepareClicksign(offer, pdf, (patch) => patchOffer(offer.id, patch));
    const { error: waitingError } = await offerDb
      .from("contract_offers")
      .update({ signature_status: "awaiting" })
      .eq("id", offer.id)
      .eq("signature_status", "preparing")
      .is("revoked_at", null);
    if (waitingError) throw new Error("Não foi possível atualizar o envio.");
    await event(offer.id, "signature_sent");
    return { requested: true };
  } catch {
    // Timeout may mean the provider accepted a request. Never blindly create a duplicate envelope.
    const current = await loadOffer(offer.id);
    if (current.signature_status === "signed") return { requested: true };
    const { error: failError } = await offerDb
      .from("contract_offers")
      .update({ signature_status: "failed", signature_issue: "delivery_failed" })
      .eq("id", offer.id)
      .neq("signature_status", "signed")
      .is("signature_issue", null)
      .is("revoked_at", null);
    if (failError) throw new Error("Não foi possível registrar a falha de envio.");
    await event(offer.id, "signature_failed");
    throw new Error(
      "Não foi possível concluir a solicitação. A TiNutri deve verificar o envio antes de tentar novamente.",
    );
  }
}
export async function download(token: string, signed: boolean) {
  const offer = await loadOfferByToken(token);
  if (signed) {
    if (offer.signature_status !== "signed" || !offer.signed_file_path)
      throw new Error("O contrato assinado ainda não está disponível.");
    const { data, error } = await offerDb.storage
      .from("contract-documents")
      .createSignedUrl(offer.signed_file_path, 60, { download: "contrato-tinutri-assinado.pdf" });
    if (error || !data) throw new Error("Não foi possível abrir o contrato assinado.");
    return { url: data.signedUrl, base64: null };
  }
  return {
    url: null,
    base64: Buffer.from(await contractPdf(offer.title, offer.body)).toString("base64"),
  };
}
