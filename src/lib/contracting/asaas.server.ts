import { z } from "zod";

export type AsaasEnvironment = "sandbox" | "production";
const HOSTS = {
  sandbox: { api: "https://api-sandbox.asaas.com/v3", invoice: "https://sandbox.asaas.com" },
  production: { api: "https://api.asaas.com/v3", invoice: "https://www.asaas.com" },
} as const;
// Produção tem chave, token de webhook e liberação próprios; sem ASAAS_PRODUCTION_ENABLED=true só o sandbox funciona.
export function asaasConfig(environment: AsaasEnvironment = "sandbox") {
  if (environment === "production") {
    const key = process.env.ASAAS_PRODUCTION_API_KEY?.trim();
    if (process.env.ASAAS_PRODUCTION_ENABLED !== "true" || !key?.startsWith("$aact_prod_"))
      throw new Error("A cobrança de produção do Asaas não está habilitada no servidor.");
    return { key, base: HOSTS.production.api, environment };
  }
  const key = process.env.ASAAS_API_KEY?.trim();
  if (process.env.ASAAS_ENVIRONMENT !== "sandbox" || !key?.startsWith("$aact_hmlg_"))
    throw new Error("Configure a chave e o ambiente sandbox do Asaas no servidor.");
  return { key, base: HOSTS.sandbox.api, environment: "sandbox" as const };
}
export function asaasWebhookToken(environment: AsaasEnvironment = "sandbox") {
  return environment === "production"
    ? process.env.ASAAS_PRODUCTION_WEBHOOK_TOKEN
    : process.env.ASAAS_WEBHOOK_TOKEN;
}
export function asaasWebhookReady(environment: AsaasEnvironment = "sandbox") {
  try {
    asaasConfig(environment);
    const token = asaasWebhookToken(environment) ?? "";
    const secrets = [
      process.env.ASAAS_API_KEY,
      process.env.ASAAS_PRODUCTION_API_KEY,
      // Um único token para os dois ambientes impediria saber de qual conta veio a notificação.
      asaasWebhookToken(environment === "production" ? "sandbox" : "production"),
    ];
    return /^[^\s]{32,255}$/.test(token) && !secrets.includes(token);
  } catch {
    return false;
  }
}
export function asaasAvailable(environment: AsaasEnvironment = "sandbox") {
  return process.env.CONTRACT_PAYMENT_PROVIDER === "asaas" && asaasWebhookReady(environment);
}
/** Ambientes com webhook configurado, na ordem em que o token recebido é comparado. */
export function asaasWebhookTokens() {
  const tokens: Partial<Record<AsaasEnvironment, string>> = {};
  for (const environment of ["sandbox", "production"] as const)
    if (asaasWebhookReady(environment)) tokens[environment] = asaasWebhookToken(environment);
  return tokens;
}
export class AsaasApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`O Asaas não concluiu a operação (HTTP ${status}).`);
    this.name = "AsaasApiError";
    this.status = status;
  }
}
export async function asaasRequest(
  path: string,
  method = "GET",
  body?: unknown,
  environment: AsaasEnvironment = "sandbox",
): Promise<unknown> {
  const config = asaasConfig(environment);
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
export function asaasInvoiceUrl(value: string, environment: AsaasEnvironment = "sandbox") {
  const url = new URL(value);
  if (url.origin !== HOSTS[environment].invoice || url.username || url.password)
    throw new Error(
      environment === "production"
        ? "A URL da fatura não pertence ao Asaas."
        : "A URL da fatura não pertence ao sandbox do Asaas.",
    );
  return url.href;
}
export async function asaasWallet(environment: AsaasEnvironment = "sandbox") {
  const list = z
    .object({ data: z.array(z.object({ id: z.string().uuid() })).length(1) })
    .parse(await asaasRequest("/wallets/", "GET", undefined, environment));
  return list.data[0].id;
}
export async function asaasCustomer(
  input: {
    reference: string;
    name: string;
    cpfCnpj: string;
    email: string;
  },
  environment: AsaasEnvironment = "sandbox",
) {
  const list = z
    .object({ data: z.array(customerSchema), hasMore: z.boolean() })
    .parse(
      await asaasRequest(
        `/customers?externalReference=${encodeURIComponent(input.reference)}&limit=2`,
        "GET",
        undefined,
        environment,
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
    await asaasRequest(
      "/customers",
      "POST",
      {
        name: input.name,
        cpfCnpj: input.cpfCnpj,
        email: input.email,
        externalReference: input.reference,
        notificationDisabled: true,
      },
      environment,
    ),
  ).id;
}
export async function asaasCreatePayment(
  input: {
    reference: string;
    customer: string;
    cents: number;
    method: keyof typeof billingTypes;
    dueDate: string;
  },
  environment: AsaasEnvironment = "sandbox",
) {
  const payment = asaasPaymentSchema.parse(
    await asaasRequest(
      "/payments",
      "POST",
      {
        customer: input.customer,
        billingType: billingTypes[input.method],
        value: input.cents / 100,
        dueDate: input.dueDate,
        externalReference: input.reference,
        description: "TiNutri · adesão ao plano",
      },
      environment,
    ),
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
  asaasInvoiceUrl(payment.invoiceUrl, environment);
  return { ...payment, invoiceUrl: payment.invoiceUrl };
}
export async function asaasGetPayment(id: string, environment: AsaasEnvironment = "sandbox") {
  resourceId.parse(id);
  return asaasPaymentSchema.parse(
    await asaasRequest(`/payments/${encodeURIComponent(id)}`, "GET", undefined, environment),
  );
}
