import type { Offer } from "./domain";
export type CheckoutClaim =
  | { state: "claimed"; worker_token: string }
  | { state: "ready"; invoice_url: string }
  | { state: "busy" };
export interface CheckoutPorts {
  wallet(): Promise<string>;
  claim(account: string): Promise<CheckoutClaim>;
  customer(): Promise<string>;
  save(
    token: string,
    customer: string,
    payment?: { id: string; invoiceUrl: string },
  ): Promise<void>;
  create(customer: string): Promise<{ id: string; invoiceUrl: string }>;
  block(token: string): Promise<void>;
  invoice(value: string): string;
}
export async function prepareContractPayment(offer: Offer, ports: CheckoutPorts) {
  if (
    offer.signature_environment !== "sandbox" ||
    offer.signature_status !== "signed" ||
    !offer.signed_file_path ||
    offer.signature_issue ||
    offer.revoked_at ||
    offer.commercial.renewal !== "manual" ||
    offer.payment_status === "confirmed" ||
    offer.payment_status === "refunded" ||
    Date.parse(offer.expires_at) <= Date.now()
  )
    throw new Error("Esta contratação não está disponível para pagamento de teste.");
  const claim = await ports.claim(await ports.wallet());
  if (claim.state === "ready") return { checkoutUrl: ports.invoice(claim.invoice_url) };
  if (claim.state !== "claimed")
    throw new Error(
      "O pagamento está sendo preparado ou precisa de revisão pela TiNutri. Não gere outra cobrança.",
    );
  try {
    const customer = await ports.customer();
    await ports.save(claim.worker_token, customer);
    const payment = await ports.create(customer);
    await ports.save(claim.worker_token, customer, payment);
    return { checkoutUrl: ports.invoice(payment.invoiceUrl) };
  } catch {
    try {
      await ports.block(claim.worker_token);
    } catch {
      /* A reserva persistente continua impedindo outra criação. */
    }
    throw new Error(
      "Não foi possível concluir a preparação. A TiNutri deve conferir o Asaas antes de tentar novamente.",
    );
  }
}
