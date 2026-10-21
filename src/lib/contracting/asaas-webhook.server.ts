import { asaasWebhookReady, asaasConfig, asaasGetPayment, asaasWallet } from "./asaas.server";
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
  enqueue: async (payload, hash) => {
    const { data, error } = await offerDb
      .rpc("enqueue_contract_webhook", {
        p_event: payload.id,
        p_type: payload.event,
        p_payment: payload.payment.id,
        p_reference: payload.payment.externalReference ?? null,
        p_hash: hash,
      })
      .abortSignal(AbortSignal.timeout(6_000));
    if (error?.code === "PGRST202") return null;
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
  verify: (payload) => handleAsaasEvent(payload, ports),
};

const ports: AsaasWebhookPorts = {
  binding: async (paymentId) => {
    const { data, error } = await offerDb
      .from("contract_payment_checkouts")
      .select("offer_id,account_id,customer_id,payment_id")
      .eq("payment_id", paymentId)
      .eq("status", "ready")
      .eq("environment", "sandbox")
      .maybeSingle();
    if (error) throw new Error("Vínculo financeiro indisponível.");
    return data;
  },
  wallet: asaasWallet,
  payment: asaasGetPayment,
  offer: loadOffer,
  confirm: async (offer, binding, eventId) => {
    const { error } = await offerDb.rpc("record_verified_contract_payment", {
      p_offer: offer.id,
      p_account: binding.account_id,
      p_payment: binding.payment_id,
      p_event: eventId,
      p_amount: offer.commercial.plan.total_cents,
      p_currency: "BRL",
      p_environment: "sandbox",
      p_confirmed_at: new Date().toISOString(),
    });
    if (error) throw new Error("Confirmação indisponível.");
    // Sandbox não convida usuários, não enfileira ativação e não libera acesso real.
  },
  invalidate: async (offerId, paymentId) => {
    const { error } = await offerDb.rpc("invalidate_sandbox_contract_payment", {
      p_offer: offerId,
      p_payment: paymentId,
    });
    if (error) throw new Error("Revisão financeira indisponível.");
  },
};
export function receiveAsaas(request: Request) {
  if (!asaasWebhookReady()) return Response.json({ state: "unconfigured" }, { status: 503 });
  return receiveQueuedAsaas(request, process.env.ASAAS_WEBHOOK_TOKEN, inboxPorts, waitUntil);
}

export const retryAsaasNotification = (id: string, actor: string) =>
  processInboxJob(id, inboxPorts, actor);

/** Called only after server-side Master authorization. Does not create or repeat a payment. */
export async function checkOfferPayment(offerId: string, actor: string) {
  asaasConfig();
  const { data, error } = await offerDb
    .from("contract_payment_checkouts")
    .select("offer_id,account_id,customer_id,payment_id")
    .eq("offer_id", offerId)
    .eq("status", "ready")
    .eq("environment", "sandbox")
    .maybeSingle();
  if (error || !data?.payment_id)
    throw new Error("A fatura ainda não está pronta para conferência.");
  let result: Response;
  try {
    result = await verifyBoundAsaasPayment(data, ports, `reconcile:${data.payment_id}`);
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
