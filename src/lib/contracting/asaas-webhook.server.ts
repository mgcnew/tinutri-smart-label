import { asaasWebhookReady, asaasConfig, asaasGetPayment, asaasWallet } from "./asaas.server";
import {
  handleAsaasWebhook,
  verifyBoundAsaasPayment,
  type AsaasWebhookPorts,
} from "./asaas-webhook-handler.server";
import { offerDb, loadOffer, event } from "./store.server";

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
  return handleAsaasWebhook(request, process.env.ASAAS_WEBHOOK_TOKEN, ports);
}

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
