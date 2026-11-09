import { money } from "./billing.ts";

/** Impressora vendida junto do plano (SQL 35). */
export const EQUIPMENT_MODES = {
  nenhum: "Sem impressora",
  comodato: "Comodato",
  venda: "Venda única",
} as const;
export type EquipmentMode = keyof typeof EQUIPMENT_MODES;
export type EquipmentModel = {
  id: string;
  name: string;
  sale_cents: number;
  loan_monthly_cents: number;
  replacement_cents: number;
  active: boolean;
  updated_at?: string;
};
export type EquipmentChoice = {
  equipment_mode?: string | null;
  equipment_model_id?: string | null;
  equipment_quantity?: number | null;
  equipment_custom_cents?: number | null;
  equipment_min_months?: number | null;
};
/** Valores do aparelho; no comodato, unitCents e totalCents são mensais. */
export type EquipmentOffer = {
  mode: Exclude<EquipmentMode, "nenhum">;
  model: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  replacementCents: number;
  minMonths: number;
  negotiated: boolean;
};
export const DEFAULT_MIN_MONTHS = 12;

/** Mesma regra do contract_guard (SQL 35). Devolve null sem impressora ou com modelo desconhecido. */
export function equipmentOffer(
  choice: EquipmentChoice,
  models: EquipmentModel[],
): EquipmentOffer | null {
  const mode = choice.equipment_mode;
  if (mode !== "comodato" && mode !== "venda") return null;
  const model = models.find((m) => m.id === choice.equipment_model_id);
  if (!model) return null;
  const quantity = choice.equipment_quantity ?? 1;
  const unitCents =
    choice.equipment_custom_cents ??
    (mode === "comodato" ? model.loan_monthly_cents : model.sale_cents);
  return {
    mode,
    model: model.name,
    quantity,
    unitCents,
    totalCents: unitCents * quantity,
    replacementCents: model.replacement_cents,
    minMonths: mode === "comodato" ? (choice.equipment_min_months ?? DEFAULT_MIN_MONTHS) : 0,
    negotiated: choice.equipment_custom_cents != null,
  };
}

export function equipmentSummary(offer: EquipmentOffer | null) {
  if (!offer) return EQUIPMENT_MODES.nenhum;
  const units = `${offer.quantity} × ${offer.model}`;
  return offer.mode === "comodato"
    ? `${units} em comodato · ${money(offer.totalCents)}/mês`
    : `${units} · venda única de ${money(offer.totalCents)}`;
}
