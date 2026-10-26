import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publishSchema, tokenSchema } from "./domain";

function privateResponse() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
export const publishOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(publishSchema)
  .handler(async ({ data, context }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.publish(data, context.supabase, context.userId);
  });
export const listOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ contractId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.list(data.contractId, context.supabase, context.userId);
  });
export const manageOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), action: z.enum(["rotate", "revoke"]) }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.manage(data.id, data.action, context.supabase, context.userId);
  });
export const readPublicOffer = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.readPublic(data.token);
  });
export const beginSignature = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenSchema, reviewed: z.literal(true) }))
  .handler(async ({ data }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.begin(data.token);
  });
export const downloadOffer = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenSchema, signed: z.boolean() }))
  .handler(async ({ data }) => {
    privateResponse();
    const api = await import("./service.server");
    return api.download(data.token, data.signed);
  });
export const payOffer = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    privateResponse();
    const { loadOfferByToken } = await import("./store.server");
    const offer = await loadOfferByToken(data.token);
    if (offer.signature_status !== "signed")
      throw new Error("Conclua as assinaturas antes de pagar.");
    const { createCheckout } = await import("./payment.server");
    return createCheckout(offer);
  });

export const retryOfferActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const { retryContractActivation } = await import("./activation.server");
    return retryContractActivation(data.id);
  });

export const checkPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const { checkOfferPayment } = await import("./asaas-webhook.server");
    return checkOfferPayment(data.id, context.userId);
  });

export const listPaymentNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ page: z.number().int().min(0).max(10000) }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const result = await context.supabase
      .from("contract_webhook_inbox" as never)
      .select(
        "id,event_type,status,result_code,attempts,deliveries,received_at,updated_at,locked_until",
        { count: "exact" },
      )
      .order("received_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.page * 10, data.page * 10 + 9);
    if (result.error?.code === "PGRST205" || result.error?.code === "42P01")
      return { installed: false, rows: [], total: 0 };
    if (result.error || result.count === null)
      throw new Error("Não foi possível consultar as notificações.");
    return {
      installed: true,
      rows: result.data as unknown as import("./notification-domain").PaymentNotification[],
      total: result.count,
    };
  });

export const retryPaymentNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const { retryAsaasNotification } = await import("./asaas-webhook.server");
    return retryAsaasNotification(data.id, context.userId);
  });

const ownConfirmation = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  consentVersion: z.literal("tinutri-email-v1"),
  accepted: z.literal(true),
});
export const confirmOwnSignature = createServerFn({ method: "POST" })
  .validator(ownConfirmation.extend({ token: tokenSchema }))
  .handler(async ({ data }) => {
    privateResponse();
    const { loadOfferByToken } = await import("./store.server");
    const { confirmCode } = await import("./own.server");
    return confirmCode(
      await loadOfferByToken(data.token),
      "client",
      null,
      data.challengeId,
      data.code,
    );
  });
export const masterOwnSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      action: z.enum(["request", "confirm", "finalize", "retry_mail"]),
      confirmation: ownConfirmation.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster, loadOffer } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const api = await import("./own.server");
    if (data.action === "finalize") return api.recoverOwnSignature(data.id);
    if (data.action === "retry_mail") return api.retryOwnMail(data.id);
    const offer = await loadOffer(data.id);
    if (data.action === "request") return api.requestCode(offer, "tinutri", context.userId);
    if (!data.confirmation) throw new Error("Informe o código e confirme o aceite do contrato.");
    return api.confirmCode(
      offer,
      "tinutri",
      context.userId,
      data.confirmation.challengeId,
      data.confirmation.code,
    );
  });

export const downloadOwnContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), signed: z.boolean() }))
  .handler(async ({ data, context }) => {
    privateResponse();
    const { requireMaster, loadOffer, offerDb } = await import("./store.server");
    await requireMaster(context.supabase, context.userId);
    const offer = await loadOffer(data.id);
    if (offer.signature_method !== "tinutri")
      throw new Error("Documento de assinatura própria indisponível.");
    let path = offer.signed_file_path;
    if (!data.signed) {
      const { preserveOwnDocument } = await import("./own-flow.server");
      const { ownPorts } = await import("./own.server");
      path = (await preserveOwnDocument(offer, ownPorts)).original_path;
    } else if (offer.signature_status !== "signed")
      throw new Error("O comprovante ainda não foi finalizado.");
    if (!path) throw new Error("Documento indisponível.");
    const result = await offerDb.storage
      .from("contract-documents")
      .createSignedUrl(path, 60, {
        download: data.signed ? "contrato-tinutri-assinado.pdf" : "contrato-tinutri-original.pdf",
      });
    if (result.error || !result.data)
      throw new Error("Não foi possível abrir o documento preservado.");
    return { url: result.data.signedUrl };
  });
