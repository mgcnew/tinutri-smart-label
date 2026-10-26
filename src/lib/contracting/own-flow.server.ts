import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { Offer } from "./domain";
import { OWN_CONSENT, OWN_CONSENT_VERSION, type OwnParty } from "./own-domain.ts";
import {
  codeContext,
  codeHmac,
  sealCode,
  unsealCode,
  newSignatureCode,
  sha256,
  ownKeys,
  evidenceHmac,
  canonicalEvidence,
} from "./own-crypto.server.ts";
import { contractPdf } from "./pdf.server.ts";
export type OwnDocument = {
  offer_id: string;
  original_sha256: string;
  original_path: string;
  final_path: string | null;
};
export type OwnAcceptance = {
  offer_id: string;
  party: OwnParty;
  name: string;
  email: string;
  original_sha256: string;
  challenge_id: string;
  consent_version: string;
  consent_text: string;
  accepted_at: string;
  actor_id: string | null;
};
export type MailClaim = {
  challenge_id: string;
  worker_token: string;
  offer_id: string;
  party: OwnParty;
  email: string;
  original_sha256: string;
  context_hash: string;
  ciphertext: string;
  key_id: string;
  expires_at: string;
};
export interface OwnPorts {
  document(offer: string): Promise<OwnDocument | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  register(offer: string, hash: string): Promise<OwnDocument>;
  issue(args: {
    id: string;
    offer: string;
    party: OwnParty;
    context: string;
    actor: string | null;
    hash: string;
    hmac: string;
    key: string;
    ciphertext: string;
    origin: string;
  }): Promise<{ state: "queued" | "accepted" | "rate_limited"; challenge_id?: string }>;
  claimMail(id: string): Promise<MailClaim | null>;
  sendMail(claim: MailClaim, code: string): Promise<void>;
  finishMail(id: string, worker: string, sent: boolean): Promise<void>;
  acceptances(offer: string): Promise<OwnAcceptance[]>;
  finish(
    offer: string,
    path: string,
    hash: string,
    manifest: Record<string, unknown>,
    hmac: string,
    key: string,
  ): Promise<void>;
}
export async function preserveOwnDocument(offer: Offer, ports: OwnPorts) {
  const existing = await ports.document(offer.id);
  if (existing) return existing;
  const pdf = await contractPdf(offer.title, offer.body, offer.created_at);
  const hash = sha256(pdf);
  const path = `${offer.id}/original/${hash}.pdf`;
  await ports.upload(path, pdf);
  return ports.register(offer.id, hash);
}
export async function deliverOwnMail(id: string, ports: OwnPorts) {
  const claim = await ports.claimMail(id);
  if (!claim) return { state: "pending" as const };
  let sent = false;
  try {
    const context = codeContext({
      id: claim.challenge_id,
      offer: claim.offer_id,
      party: claim.party,
      pdf: claim.original_sha256,
      context: claim.context_hash,
    });
    const code = unsealCode(claim.ciphertext, context, claim.key_id);
    await ports.sendMail(claim, code);
    sent = true;
  } finally {
    await ports.finishMail(claim.challenge_id, claim.worker_token, sent);
  }
  return { state: "sent" as const };
}
export async function requestOwnCode(
  offer: Offer,
  party: OwnParty,
  context: string,
  actor: string | null,
  origin: string,
  ports: OwnPorts,
) {
  const doc = await preserveOwnDocument(offer, ports);
  const id = randomUUID(),
    code = newSignatureCode(),
    keys = ownKeys();
  const bound = codeContext({ id, offer: offer.id, party, pdf: doc.original_sha256, context });
  const result = await ports.issue({
    id,
    offer: offer.id,
    party,
    context,
    actor,
    origin,
    hash: doc.original_sha256,
    hmac: codeHmac(code, bound, keys.id),
    key: keys.id,
    ciphertext: sealCode(code, bound, keys.id),
  });
  if (result.state === "rate_limited")
    throw new Error(
      "Aguarde ao menos um minuto entre envios. Há também um limite de pedidos por período.",
    );
  if (result.state === "accepted") return { state: "accepted" as const };
  // Persistence precedes SMTP. Failure does not expose the code or discard the challenge.
  try {
    return await deliverOwnMail(id, ports);
  } catch {
    return { state: "pending" as const };
  }
}
export async function finalizeOwnSignature(offer: Offer, ports: OwnPorts) {
  if (offer.signature_method !== "tinutri" || offer.revoked_at || offer.signature_issue)
    throw new Error("Assinatura indisponível.");
  const doc = await ports.document(offer.id);
  if (!doc) throw new Error("Documento original indisponível.");
  if (doc.final_path) return { state: "signed" as const };
  const rows = (await ports.acceptances(offer.id)).sort((a, b) => a.party.localeCompare(b.party));
  if (rows.length !== 2 || rows[0].party !== "client" || rows[1].party !== "tinutri")
    return { state: "waiting" as const };
  for (const row of rows) {
    const expected = row.party === "client" ? offer.signer : offer.provider_signer;
    if (
      row.offer_id !== offer.id ||
      row.original_sha256 !== doc.original_sha256 ||
      row.email !== expected.email ||
      row.name !== expected.name ||
      row.consent_version !== OWN_CONSENT_VERSION ||
      row.consent_text !== OWN_CONSENT
    )
      throw new Error("Evidências divergentes do contrato.");
  }
  const original = await ports.download(doc.original_path);
  if (sha256(original) !== doc.original_sha256)
    throw new Error("A integridade do PDF original precisa de revisão.");
  const keys = ownKeys();
  const manifest = {
    version: 1,
    offer_id: offer.id,
    method: "tinutri-email-otp",
    environment: offer.signature_environment,
    original_sha256: doc.original_sha256,
    body_sha256: offer.body_sha256,
    consent_version: OWN_CONSENT_VERSION,
    acceptances: rows,
    key_id: keys.id,
  };
  const hmac = evidenceHmac(canonicalEvidence(manifest), keys.id);
  const evidence = [
    "Assinatura eletrônica por confirmação de e-mail. Este comprovante não é um certificado ICP-Brasil.",
    `Contratação: ${offer.id}`,
    `Ambiente: ${offer.signature_environment === "sandbox" ? "TESTE — SEM ATIVAÇÃO REAL" : "produção"}`,
    `SHA-256 do PDF original: ${doc.original_sha256}`,
    `Versão do aceite: ${OWN_CONSENT_VERSION}`,
    OWN_CONSENT,
    ...rows.flatMap((row) => [
      `Representante ${row.party === "client" ? "da contratante" : "da TiNutri"}: ${row.name}`,
      `E-mail confirmado: ${row.email}`,
      `Aceite registrado em UTC: ${row.accepted_at}`,
      `Identificação do desafio: ${row.challenge_id}`,
    ]),
    `Proteção do manifesto pelo servidor (HMAC-SHA256): ${hmac}`,
    `Identificação da chave: ${keys.id}`,
    "A confirmação registra controle do e-mail indicado e o aceite desta versão. A identificação civil e os poderes de representação não são certificados por este mecanismo.",
  ].join("\n\n");
  const last = rows
    .map((row) => row.accepted_at)
    .sort()
    .at(-1)!;
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const audit = await PDFDocument.load(
    await contractPdf("Comprovante de assinatura eletrônica TiNutri", evidence, last),
  );
  for (const page of await pdf.copyPages(audit, audit.getPageIndices())) pdf.addPage(page);
  pdf.setModificationDate(new Date(last));
  const bytes = await pdf.save();
  const hash = sha256(bytes);
  const path = `${offer.id}/signed/${hash}.pdf`;
  await ports.upload(path, bytes);
  await ports.finish(offer.id, path, hash, manifest, hmac, keys.id);
  return { state: "signed" as const };
}
