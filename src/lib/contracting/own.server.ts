import { isIP } from "node:net";
import { getRequest } from "@tanstack/react-start/server";
import { offerDb, loadOffer, hash } from "./store.server";
import { ownSignatureAvailable, signatureEnvironment } from "./config.server";
import { codeContext, codeHmac, originHash, sha256 } from "./own-crypto.server";
import { sendOwnSignatureCode } from "./own-mail.server";
import {
  requestOwnCode,
  deliverOwnMail,
  finalizeOwnSignature,
  type OwnPorts,
  type OwnDocument,
  type OwnAcceptance,
  type MailClaim,
} from "./own-flow.server";
import type { OwnParty, OwnSignatureSummary } from "./own-domain";
import type { Offer } from "./domain";
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await offerDb.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PGRST202" || error.code === "42P01"
        ? "Aplique o SQL 26 de assinatura própria após as migrações anteriores."
        : "Não foi possível concluir a assinatura. Confira os dados, o prazo e tente novamente.",
    );
  return data;
}
async function storageDownload(path: string) {
  const { data, error } = await offerDb.storage.from("contract-documents").download(path);
  if (error || !data || data.size > 20 * 1024 * 1024)
    throw new Error("Documento preservado indisponível.");
  return new Uint8Array(await data.arrayBuffer());
}
export const ownPorts: OwnPorts = {
  document: async (id) => {
    const { data, error } = await offerDb
      .from("contract_own_documents")
      .select("*")
      .eq("offer_id", id)
      .maybeSingle();
    if (error) throw new Error("Confira a instalação do SQL 26 de assinatura própria.");
    return data as OwnDocument | null;
  },
  download: storageDownload,
  upload: async (path, bytes) => {
    const { error } = await offerDb.storage
      .from("contract-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) {
      if (String(error.statusCode) !== "409" && !/already exists/i.test(error.message))
        throw new Error("Não foi possível preservar o PDF.");
      if (sha256(await storageDownload(path)) !== sha256(bytes))
        throw new Error("Arquivo preservado divergente.");
    }
  },
  register: (id, hash) => rpc("register_own_contract_document", { p_offer: id, p_hash: hash }),
  issue: (args) =>
    rpc("issue_own_signature_code", {
      p_id: args.id,
      p_offer: args.offer,
      p_party: args.party,
      p_context: args.context,
      p_actor: args.actor,
      p_hash: args.hash,
      p_hmac: args.hmac,
      p_key: args.key,
      p_ciphertext: args.ciphertext,
      p_origin: args.origin,
    }),
  claimMail: (id) => rpc("claim_own_signature_mail", { p_id: id }) as Promise<MailClaim | null>,
  sendMail: async (claim, code) => {
    const offer = await loadOffer(claim.offer_id);
    await sendOwnSignatureCode({
      id: claim.challenge_id,
      to: claim.email,
      code,
      pdf: claim.original_sha256,
      expires: claim.expires_at,
      sandbox: offer.signature_environment === "sandbox",
    });
  },
  finishMail: (id, token, sent) =>
    rpc("finish_own_signature_mail", { p_id: id, p_token: token, p_sent: sent }),
  acceptances: async (id) => {
    const { data, error } = await offerDb
      .from("contract_own_acceptances")
      .select("*")
      .eq("offer_id", id);
    if (error) throw new Error("Evidências indisponíveis.");
    return data as OwnAcceptance[];
  },
  finish: (id, path, hash, manifest, hmac, key) =>
    rpc("finish_own_contract_signature", {
      p_offer: id,
      p_path: path,
      p_sha256: hash,
      p_manifest: manifest,
      p_hmac: hmac,
      p_key: key,
    }),
};
function assertReady(offer: Offer) {
  if (
    !ownSignatureAvailable() ||
    offer.signature_method !== "tinutri" ||
    offer.signature_environment !== signatureEnvironment()
  )
    throw new Error("A assinatura por código ainda não está disponível neste ambiente.");
}
function contextFor(offer: Offer, party: OwnParty, actor: string | null) {
  return party === "client" ? offer.token_hash : hash(`tinutri-signature:${actor}:${offer.id}`);
}
function requestOrigin() {
  const header =
    process.env.VERCEL === "1" ? getRequest().headers.get("x-vercel-forwarded-for")?.trim() : null;
  if (process.env.VERCEL === "1" && (!header || !isIP(header)))
    throw new Error("Não foi possível validar a origem do pedido.");
  return originHash(header ?? "local-development");
}
export async function ownSummary(
  offer: Offer,
  party: OwnParty,
  actor: string | null = null,
  actorEmail?: string,
): Promise<OwnSignatureSummary> {
  const accepted = await ownPorts.acceptances(offer.id);
  const { data, error } = await offerDb
    .from("contract_own_challenges")
    .select("id,expires_at,consumed_at,invalidated_at")
    .eq("offer_id", offer.id)
    .eq("party", party)
    .eq("context_hash", contextFor(offer, party, actor))
    .is("invalidated_at", null)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o pedido de assinatura.");
  let challenge: OwnSignatureSummary["challenge"] = null;
  if (data && Date.parse(data.expires_at) > Date.now()) {
    const m = await offerDb
      .from("contract_own_mail_outbox")
      .select("status")
      .eq("challenge_id", data.id)
      .single();
    if (m.error) throw new Error("Envio indisponível.");
    challenge = { id: data.id, expiresAt: data.expires_at, delivery: m.data.status };
  }
  let maySign = party === "client";
  if (party === "tinutri" && actor) {
    maySign = actorEmail?.toLowerCase() === offer.provider_signer.email.toLowerCase();
  }
  return {
    clientAccepted: accepted.some((r) => r.party === "client"),
    tinutriAccepted: accepted.some((r) => r.party === "tinutri"),
    maySign,
    challenge,
  };
}
export async function requestCode(offer: Offer, party: OwnParty, actor: string | null) {
  assertReady(offer);
  return requestOwnCode(
    offer,
    party,
    contextFor(offer, party, actor),
    actor,
    requestOrigin(),
    ownPorts,
  );
}
export async function confirmCode(
  offer: Offer,
  party: OwnParty,
  actor: string | null,
  id: string,
  code: string,
) {
  assertReady(offer);
  const { data: c, error } = await offerDb
    .from("contract_own_challenges")
    .select("id,offer_id,party,context_hash,original_sha256,key_id")
    .eq("id", id)
    .eq("offer_id", offer.id)
    .eq("party", party)
    .single();
  const context = contextFor(offer, party, actor);
  if (error || !c || c.context_hash !== context)
    throw new Error(
      "Código inválido, expirado ou indisponível. Solicite um novo código se necessário.",
    );
  const bound = codeContext({
    id: c.id,
    offer: c.offer_id,
    party: c.party,
    pdf: c.original_sha256,
    context,
  });
  const result = await rpc("confirm_own_signature", {
    p_id: id,
    p_context: context,
    p_hmac: codeHmac(code, bound, c.key_id),
    p_actor: actor,
  });
  if (result.state !== "accepted")
    throw new Error(
      "Código inválido, expirado ou indisponível. Solicite um novo código se necessário.",
    );
  try {
    return await finalizeOwnSignature(offer, ownPorts);
  } catch {
    return { state: "finalization_pending" as const };
  }
}
export async function recoverOwnSignature(id: string) {
  const offer = await loadOffer(id);
  assertReady(offer);
  try {
    return await finalizeOwnSignature(offer, ownPorts);
  } catch {
    throw new Error(
      "Os aceites foram preservados, mas o documento ainda não pôde ser finalizado. Verifique o armazenamento e tente novamente.",
    );
  }
}
export async function retryOwnMail(id: string) {
  const offer = await loadOffer(id);
  assertReady(offer);
  await rpc("expire_own_signature_codes", {});
  const { data, error } = await offerDb
    .from("contract_own_challenges")
    .select("id")
    .eq("offer_id", id)
    .is("consumed_at", null)
    .is("invalidated_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(2);
  if (error) throw new Error("Pedidos de envio indisponíveis.");
  try {
    for (const row of data ?? []) await deliverOwnMail(row.id, ownPorts);
    return { state: "checked" as const };
  } catch {
    throw new Error(
      "O envio ainda não foi confirmado. Confira o Gmail e tente novamente após o intervalo.",
    );
  }
}
