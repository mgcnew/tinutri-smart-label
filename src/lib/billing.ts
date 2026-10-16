export const BILLING_PLANS = {
  mensal: { name: "Mensal", months: 1, monthlyCents: 5990 },
  trimestral: { name: "Trimestral", months: 3, monthlyCents: 5490 },
  anual: { name: "Anual", months: 12, monthlyCents: 4990 },
} as const;
export type BillingCycle = keyof typeof BILLING_PLANS;
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const billingPlan = (value: string) => BILLING_PLANS[value as BillingCycle];
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
