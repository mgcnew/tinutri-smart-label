import { z } from "zod";

// Esta primeira integração funciona exclusivamente em sandbox.
export function asaasConfig() {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (process.env.ASAAS_ENVIRONMENT !== "sandbox" || !key?.startsWith("$aact_hmlg_"))
    throw new Error("Configure a chave e o ambiente sandbox do Asaas no servidor.");
  return { key, base: "https://api-sandbox.asaas.com/v3", environment: "sandbox" as const };
}
export function asaasWebhookReady() {
  try {
    asaasConfig();
    const token = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
    return /^[^\s]{32,255}$/.test(token) && token !== process.env.ASAAS_API_KEY;
  } catch {
    return false;
  }
}
export function asaasAvailable() {
  return process.env.CONTRACT_PAYMENT_PROVIDER === "asaas" && asaasWebhookReady();
}
export class AsaasApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`O Asaas não concluiu a operação (HTTP ${status}).`);
    this.name = "AsaasApiError";
    this.status = status;
  }
}
export async function asaasRequest(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const config = asaasConfig();
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Recurso Asaas inválido.");
  let response: Response;
  try {
    response = await fetch(`${config.base}${path}`, {
      method,
      headers: {
        access_token: config.key,
        "User-Agent": "TiNutri/1.0",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error(
      "Não foi possível confirmar a resposta do Asaas. A operação precisa de revisão.",
    );
  }
  if (!response.ok) throw new AsaasApiError(response.status);
  return response.json();
}
const resourceId = z.string().regex(/^[A-Za-z0-9_-]{3,100}$/);
const customerSchema = z.object({
  id: resourceId,
  externalReference: z.string().nullable().optional(),
});
export const asaasPaymentSchema = z.object({
  id: resourceId,
  customer: resourceId,
  externalReference: z.string().nullable(),
  value: z.number().finite().nonnegative(),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "RECEIVED_IN_CASH", "UNDEFINED"]),
  status: z.string(),
  deleted: z.boolean().optional(),
  invoiceUrl: z.string().url().nullish(),
  refunds: z
    .array(z.object({ value: z.number().finite().nonnegative(), status: z.string().optional() }))
    .nullish(),
  confirmedDate: z.string().nullable().optional(),
  paymentDate: z.string().nullable().optional(),
});
export type AsaasPayment = z.infer<typeof asaasPaymentSchema>;
export const billingTypes = { pix: "PIX", boleto: "BOLETO", cartao: "CREDIT_CARD" } as const;
export function asaasInvoiceUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== "https://sandbox.asaas.com" || url.username || url.password)
    throw new Error("A URL da fatura não pertence ao sandbox do Asaas.");
  return url.href;
}
export async function asaasWallet() {
  const list = z
    .object({ data: z.array(z.object({ id: z.string().uuid() })).length(1) })
    .parse(await asaasRequest("/wallets/"));
  return list.data[0].id;
}
export async function asaasCustomer(input: {
  reference: string;
  name: string;
  cpfCnpj: string;
  email: string;
}) {
  const list = z
    .object({ data: z.array(customerSchema), hasMore: z.boolean() })
    .parse(
      await asaasRequest(
        `/customers?externalReference=${encodeURIComponent(input.reference)}&limit=2`,
      ),
    );
  if (list.hasMore || list.data.length > 1)
    throw new Error("Cadastro Asaas duplicado; revisão necessária.");
  if (list.data.length === 1) {
    if (list.data[0].externalReference !== input.reference)
      throw new Error("Cadastro Asaas incompatível.");
    return list.data[0].id;
  }
  return customerSchema.parse(
    await asaasRequest("/customers", "POST", {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      externalReference: input.reference,
      notificationDisabled: true,
    }),
  ).id;
}
export async function asaasCreatePayment(input: {
  reference: string;
  customer: string;
  cents: number;
  method: keyof typeof billingTypes;
  dueDate: string;
}) {
  const payment = asaasPaymentSchema.parse(
    await asaasRequest("/payments", "POST", {
      customer: input.customer,
      billingType: billingTypes[input.method],
      value: input.cents / 100,
      dueDate: input.dueDate,
      externalReference: input.reference,
      description: "TiNutri · adesão ao plano",
    }),
  );
  if (
    payment.externalReference !== input.reference ||
    payment.customer !== input.customer ||
    Math.abs(payment.value * 100 - input.cents) > 0.000001 ||
    payment.billingType !== billingTypes[input.method] ||
    payment.deleted
  )
    throw new Error("A cobrança retornada pelo Asaas diverge da contratação.");
  if (!payment.invoiceUrl) throw new Error("O Asaas não retornou a fatura para pagamento.");
  asaasInvoiceUrl(payment.invoiceUrl);
  return { ...payment, invoiceUrl: payment.invoiceUrl };
}
export async function asaasGetPayment(id: string) {
  resourceId.parse(id);
  return asaasPaymentSchema.parse(await asaasRequest(`/payments/${encodeURIComponent(id)}`));
}
