export const BILLING_PLANS = {
  mensal: { name: "Mensal", months: 1 },
  trimestral: { name: "Trimestral", months: 3 },
  anual: { name: "Anual", months: 12 },
} as const;
export type BillingCycle = keyof typeof BILLING_PLANS;
/** Preço mensal equivalente de cada período, em centavos (tabela billing_prices, SQL 34). */
export type BillingPrices = Record<BillingCycle, number>;
/** Valores anteriores ao SQL 34; usados só enquanto a tabela não estiver instalada. */
export const DEFAULT_PRICES: BillingPrices = { mensal: 5990, trimestral: 5490, anual: 4990 };
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
/** Plano com o preço efetivo: o valor negociado da empresa, quando houver, ou o da tabela. */
export function billingPlan(
  value: string,
  prices: BillingPrices = DEFAULT_PRICES,
  customCents?: number | null,
) {
  if (!Object.hasOwn(BILLING_PLANS, value)) return undefined;
  const plan = BILLING_PLANS[value as BillingCycle];
  const monthlyCents = customCents ?? prices[value as BillingCycle];
  return {
    ...plan,
    monthlyCents,
    totalCents: monthlyCents * plan.months,
    negotiated: customCents != null,
  };
}
/** Converte "59,90" ou "R$ 1.059,90" em centavos; null quando vazio ou inválido. */
export function parseCents(text: string) {
  const raw = text.replace(/[R$\s]/g, "");
  const clean = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
export const centsInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
export const SUBSCRIPTION_STATUS = {
  pendente: "Aguardando adesão",
  ativa: "Ativa · controle manual",
  cancelada: "Cancelada",
} as const;
export function displayDate(value?: string | null) {
  if (!value) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(value.slice(0, 10) + "T12:00:00Z"),
  );
}
