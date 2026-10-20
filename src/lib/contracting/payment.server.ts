import { z } from "zod";
import type { Offer } from "./domain";
import {
  asaasAvailable,
  asaasWallet,
  asaasCustomer,
  asaasCreatePayment,
  asaasInvoiceUrl,
} from "./asaas.server";
import { offerDb } from "./store.server";
import { prepareContractPayment } from "./payment-flow.server";

export function paymentAvailable(offer: Pick<Offer, "signature_environment" | "commercial">) {
  return (
    asaasAvailable() &&
    offer.signature_environment === "sandbox" &&
    offer.commercial.renewal === "manual"
  );
}
/** One durable reservation per offer. Never automatically retry an uncertain external creation. */
export async function createCheckout(offer: Offer): Promise<{ checkoutUrl: string }> {
  if (!paymentAvailable(offer))
    throw new Error("O pagamento online ainda não está disponível para esta contratação.");
  const { data: contract, error } = await offerDb
    .from("service_contracts")
    .select("company_snapshot")
    .eq("id", offer.contract_id)
    .single();
  const company = z
    .object({ cnpj: z.string(), legal_name: z.string().nullable().optional(), name: z.string() })
    .safeParse(contract?.company_snapshot);
  if (error || !company.success)
    throw new Error("Revise os dados da empresa na minuta antes de cobrar.");
  const cpfCnpj = company.data.cnpj.replace(/\D/g, "");
  if (![11, 14].includes(cpfCnpj.length)) throw new Error("Revise o CPF/CNPJ congelado na minuta.");
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await offerDb.rpc(name, args);
    if (result.error)
      throw new Error("Não foi possível preservar o pagamento. Confira a instalação do SQL 24.");
    return result.data;
  };
  return prepareContractPayment(offer, {
    wallet: asaasWallet,
    claim: async (account) =>
      z
        .discriminatedUnion("state", [
          z.object({ state: z.literal("claimed"), worker_token: z.string().uuid() }),
          z.object({ state: z.literal("ready"), invoice_url: z.string().url() }),
          z.object({ state: z.literal("busy") }),
        ])
        .parse(await call("claim_contract_checkout", { p_offer: offer.id, p_account: account })),
    customer: () =>
      asaasCustomer({
        reference: `tinutri:${offer.id}`,
        name: company.data.legal_name || company.data.name,
        cpfCnpj,
        email: offer.signer.email,
      }),
    save: async (token, customer, payment) => {
      await call("save_contract_checkout", {
        p_offer: offer.id,
        p_token: token,
        p_customer: customer,
        p_payment: payment?.id ?? null,
        p_url: payment?.invoiceUrl ?? null,
      });
    },
    create: (customer) => {
      const dueDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Math.min(Date.now() + 3 * 86400_000, Date.parse(offer.expires_at))));
      return asaasCreatePayment({
        reference: `tinutri:${offer.id}`,
        customer,
        cents: offer.commercial.plan.total_cents,
        method: offer.commercial.payment,
        dueDate,
      });
    },
    block: async (token) => {
      await call("block_contract_checkout", { p_offer: offer.id, p_token: token });
    },
    invoice: asaasInvoiceUrl,
  });
}
