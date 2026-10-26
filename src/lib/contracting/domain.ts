import { z } from "zod";

export const personSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(160)
    .transform((v) => v.toLowerCase()),
});
export const planSchema = z
  .object({
    cycle: z.enum(["mensal", "trimestral", "anual"]),
    months: z.union([z.literal(1), z.literal(3), z.literal(12)]),
    monthly_cents: z.number().int().positive(),
    total_cents: z.number().int().positive(),
  })
  .refine(
    (p) =>
      p.total_cents === p.monthly_cents * p.months &&
      p.months === { mensal: 1, trimestral: 3, anual: 12 }[p.cycle],
    "Plano inconsistente.",
  );
export const commercialSchema = z.object({
  start: z.literal("activation"),
  payment: z.enum(["pix", "boleto", "cartao"]),
  renewal: z.enum(["manual", "automatica"]),
  plan: planSchema,
});
export type CommercialSnapshot = z.infer<typeof commercialSchema>;
export type Person = z.infer<typeof personSchema>;
export type SignatureStatus = "pending" | "preparing" | "awaiting" | "signed" | "failed";
export type SignatureIssue = "delivery_failed" | "refused" | "canceled" | "deadline";
export const SIGNATURE_ISSUE_NAMES: Record<SignatureIssue, string> = {
  delivery_failed: "Envio precisa de verificação",
  refused: "Assinatura recusada",
  canceled: "Solicitação cancelada",
  deadline: "Prazo de assinatura encerrado",
};
export type ActivationErrorCode =
  "account_conflict" | "invite_uncertain" | "database_unavailable" | "activation_unavailable";
export const ACTIVATION_ERROR_NAMES: Record<ActivationErrorCode, string> = {
  account_conflict: "O e-mail já pertence a uma conta que precisa de revisão antes da vinculação.",
  invite_uncertain: "O convite precisa de verificação antes de um novo envio.",
  database_unavailable:
    "Não foi possível preservar o progresso. Confira o usuário antes de retomar.",
  activation_unavailable: "A ativação precisa de revisão das condições de acesso e pagamento.",
};
export type ActivationSummary = {
  status: "pending" | "processing" | "blocked" | "completed";
  error_code: ActivationErrorCode | null;
};
export type OfferEvent = { kind: string; created_at: string };
export const OFFER_EVENT_NAMES: Record<string, string> = {
  published: "Link preparado",
  link_rotated: "Link substituído",
  revoked: "Contratação revogada",
  signature_requested: "Assinatura solicitada",
  signature_sent: "Solicitação enviada",
  signature_code_requested: "Código de assinatura solicitado",
  signature_accepted: "Aceite de assinatura registrado",
  signature_failed: "Envio precisa de verificação",
  signature_completed: "Assinaturas concluídas",
  signature_refused: "Assinatura recusada",
  signature_canceled: "Solicitação cancelada",
  signature_deadline: "Prazo de assinatura encerrado",
  activation_started: "Preparação do acesso iniciada",
  activation_blocked: "Preparação do acesso precisa de revisão",
  access_activated: "Acesso liberado",
  payment_confirmed: "Pagamento confirmado",
  payment_preparing: "Pagamento em preparação",
  payment_created: "Fatura preparada",
  payment_review_required: "Cobrança precisa de revisão",
  payment_invalidated: "Pagamento invalidado",
  payment_checked: "Pagamento conferido no Asaas",
};
export type PaymentStatus = "unconfigured" | "pending" | "confirmed" | "refunded";
export type Offer = {
  signature_method?: "clicksign" | "tinutri";
  id: string;
  contract_id: string;
  client_id: string;
  title: string;
  body: string;
  body_sha256: string;
  company_name: string;
  commercial: CommercialSnapshot;
  signer: Person;
  provider_signer: Person;
  access_contact: Person;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  signature_status: SignatureStatus;
  signature_issue?: SignatureIssue | null;
  payment_status: PaymentStatus;
  signature_environment: "disabled" | "sandbox" | "production";
  provider_envelope_id: string | null;
  provider_document_id: string | null;
  provider_signer_id: string | null;
  provider_company_signer_id: string | null;
  signing_url: string | null;
  signed_file_path: string | null;
  signed_at: string | null;
  payment_provider_id: string | null;
  paid_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  last_checked_at: string | null;
};
export type OfferStage = "expired" | "revoked" | "signature" | "payment" | "activation" | "active";
export function offerStage(
  offer: Pick<
    Offer,
    "revoked_at" | "expires_at" | "signature_status" | "payment_status" | "activated_at"
  >,
  now = new Date(),
): OfferStage {
  if (offer.revoked_at) return "revoked";
  if (new Date(offer.expires_at).getTime() <= now.getTime()) return "expired";
  if (offer.activated_at) return "active";
  if (offer.signature_status !== "signed") return "signature";
  if (offer.payment_status !== "confirmed") return "payment";
  return "activation";
}
export const STAGE_NAMES: Record<OfferStage, string> = {
  expired: "Link expirado",
  revoked: "Link revogado",
  signature: "Aguardando assinatura",
  payment: "Aguardando pagamento",
  activation: "Aguardando ativação",
  active: "Acesso liberado",
};
export function canActivate(
  offer: Pick<
    Offer,
    | "revoked_at"
    | "signature_status"
    | "payment_status"
    | "signature_environment"
    | "signed_file_path"
    | "paid_at"
  >,
) {
  return (
    !offer.revoked_at &&
    offer.signature_environment === "production" &&
    offer.signature_status === "signed" &&
    !!offer.signed_file_path &&
    offer.payment_status === "confirmed" &&
    !!offer.paid_at
  );
}
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const publishSchema = z.object({
  contractId: z.string().uuid(),
  updatedAt: z.string().datetime({ offset: true }),
  signer: personSchema,
  providerSigner: personSchema,
  accessContact: personSchema,
  expiresDays: z.number().int().min(1).max(30),
  reviewed: z.literal(true),
});
export type PublishInput = z.infer<typeof publishSchema>;
export type PublicOffer = Pick<
  Offer,
  | "id"
  | "title"
  | "body"
  | "body_sha256"
  | "company_name"
  | "commercial"
  | "expires_at"
  | "signature_status"
  | "payment_status"
  | "signature_environment"
  | "signed_at"
  | "activated_at"
> & {
  signatureMethod?: "clicksign" | "tinutri";
  ownSignature?: import("./own-domain").OwnSignatureSummary;
  stage: OfferStage;
  signatureIssue?: SignatureIssue | null;
  signerName: string;
  signerEmailHint: string;
  signatureAvailable: boolean;
  paymentAvailable: boolean;
  signedDocumentAvailable: boolean;
};
export function emailHint(email: string) {
  const [name, host] = email.split("@");
  return `${name.slice(0, 2)}•••@${host}`;
}
/** A frozen copy; never mutate the original draft or infer commercial values from prose. */
export function finalContractBody(body: string) {
  if (/\[PENDENTE:/i.test(body))
    throw new Error("Complete os campos pendentes da minuta antes de preparar o link.");
  return body.replace(/^MINUTA PARA REVISÃO — NÃO ASSINADA\s*\n/, "").trim();
}
