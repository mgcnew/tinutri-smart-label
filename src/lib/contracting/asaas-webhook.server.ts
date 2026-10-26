import {
  asaasConfig,
  asaasGetPayment,
  asaasWallet,
  asaasWebhookTokens,
  type AsaasEnvironment,
} from "./asaas.server";
import {
  handleAsaasEvent,
  verifyBoundAsaasPayment,
  type AsaasWebhookPorts,
} from "./asaas-webhook-handler.server";
import { offerDb, loadOffer, event } from "./store.server";
import { waitUntil } from "@vercel/functions";
import {
  receiveQueuedAsaas,
  processInboxJob,
  type InboxPorts,
  type InboxClaim,
} from "./webhook-queue.server";

export const inboxPorts: InboxPorts = {
  enqueue: async (payload, hash, environment) => {
    const { data, error } = await offerDb
      .rpc("enqueue_contract_webhook", {
        p_event: payload.id,
        p_type: payload.event,
        p_payment: payload.payment.id,
        p_reference: payload.payment.externalReference ?? null,
        p_hash: hash,
        // Sem o SQL 29 a função só tem 5 argumentos; o sandbox continua chamando dessa forma.
        ...(environment === "production" ? { p_environment: environment } : {}),
      })
      .abortSignal(AbortSignal.timeout(6_000));
    if (error?.code === "PGRST202" && environment === "sandbox") return null;
    if (error) throw new Error("Não foi possível preservar a notificação.");
    return data;
  },
  claim: async (id, actor) => {
    const { data, error } = await offerDb.rpc("claim_contract_webhook", {
      p_id: id,
      p_actor: actor ?? null,
    });
    if (error) throw new Error("Não foi possível reservar a notificação.");
    return data as InboxClaim | null;
  },
  finish: async (claim, status, result) => {
    const { error } = await offerDb.rpc("finish_contract_webhook", {
      p_id: claim.id,
      p_token: claim.worker_token,
      p_status: status,
      p_result: result,
    });
    if (error) throw new Error("Não foi possível preservar o resultado da notificação.");
  },
  verify: (payload, environment) => handleAsaasEvent(payload, ports(environment), environment),
};

const ports = (environment: AsaasEnvironment): AsaasWebhookPorts => ({
  binding: async (paymentId) => {
    const { data, error } = await offerDb
      .from("contract_payment_checkouts")
      .select("offer_id,account_id,customer_id,payment_id")
      .eq("payment_id", paymentId)
      .eq("status", "ready")
      .eq("environment", environment)
      .maybeSingle();
    if (error) throw new Error("Vínculo financeiro indisponível.");
    return data;
  },
  wallet: () => asaasWallet(environment),
  payment: (id) => asaasGetPayment(id, environment),
  offer: loadOffer,
  confirm: async (offer, binding, eventId) => {
    const { error } = await offerDb.rpc("record_verified_contract_payment", {
      p_offer: offer.id,
      p_account: binding.account_id,
      p_payment: binding.payment_id,
      p_event: eventId,
      p_amount: offer.commercial.plan.total_cents,
      p_currency: "BRL",
      p_environment: environment,
      p_confirmed_at: new Date().toISOString(),
    });
    if (error) throw new Error("Confirmação indisponível.");
  },
  // O SQL já enfileirou a ativação na confirmação de produção. Ela só roda com
  // CONTRACT_ACTIVATION_ENABLED=true; desligada, ou se falhar, fica pendente para o Master retomar.
  activate: async (offerId) => {
    const { queueContractActivation } = await import("./activation.server");
    await queueContractActivation(offerId);
  },
  invalidate: async (offerId, paymentId) => {
    const { error } = await offerDb.rpc(
      environment === "production"
        ? "invalidate_contract_payment"
        : "invalidate_sandbox_contract_payment",
      { p_offer: offerId, p_payment: paymentId },
    );
    if (error) throw new Error("Revisão financeira indisponível.");
  },
});
export function receiveAsaas(request: Request) {
  const tokens = asaasWebhookTokens();
  if (!tokens.sandbox && !tokens.production)
    return Response.json({ state: "unconfigured" }, { status: 503 });
  return receiveQueuedAsaas(request, tokens, inboxPorts, waitUntil);
}

export const retryAsaasNotification = (id: string, actor: string) =>
  processInboxJob(id, inboxPorts, actor);

/** Called only after server-side Master authorization. Does not create or repeat a payment. */
export async function checkOfferPayment(offerId: string, actor: string) {
  const offer = await loadOffer(offerId);
  const environment = offer.signature_environment === "production" ? "production" : "sandbox";
  asaasConfig(environment);
  const { data, error } = await offerDb
    .from("contract_payment_checkouts")
    .select("offer_id,account_id,customer_id,payment_id")
    .eq("offer_id", offerId)
    .eq("status", "ready")
    .eq("environment", environment)
    .maybeSingle();
  if (error || !data?.payment_id)
    throw new Error("A fatura ainda não está pronta para conferência.");
  let result: Response;
  try {
    result = await verifyBoundAsaasPayment(
      data,
      ports(environment),
      `reconcile:${data.payment_id}`,
      true,
      environment,
    );
  } catch {
    throw new Error("Não foi possível consultar o Asaas. A situação do pagamento foi preservada.");
  }
  if (!result.ok)
    throw new Error(
      "A cobrança precisa de revisão: confira conta, valor e assinatura antes de continuar.",
    );
  const status = (await result.json()) as { state: string };
  await event(offerId, "payment_checked", { actor });
  return status;
}
