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
