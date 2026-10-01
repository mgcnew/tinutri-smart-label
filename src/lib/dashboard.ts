import { addDays, endOfDay } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type OperationalLabel = Database["public"]["Tables"]["issued_labels"]["Row"];
export type LabelEvent = Database["public"]["Tables"]["label_events"]["Row"];
export type RecentAction = LabelEvent & {
  source?: "label" | "activity";
  entity_type?: string | null;
  entity_id?: string | null;
  entity_name?: string;
  label: Pick<OperationalLabel, "id" | "product_name" | "client_name" | "lot_number"> | null;
};
export type ExpiryWindow = "all" | "expired" | "today" | "three" | "seven";

export const EXPIRY_WINDOW_NAMES: Record<ExpiryWindow, string> = {
  all: "Todas as validades",
  expired: "Já vencidas",
  today: "Vencem hoje",
  three: "Nos próximos 3 dias",
  seven: "De 4 a 7 dias",
};

export const EVENT_NAMES: Record<string, string> = {
  emissao: "preparou a etiqueta",
  impressao_confirmada: "confirmou a impressão",
  falha_impressao: "registrou uma falha de impressão",
  reimpressao: "solicitou uma reimpressão",
  baixa_utilizada: "registrou a utilização",
  baixa_consumida: "registrou o consumo",
  baixa_descartada: "registrou o descarte",
  produto_criado: "cadastrou o produto",
  produto_atualizado: "atualizou o produto",
  produto_inativado: "inativou o produto",
  colaborador_criado: "cadastrou o colaborador",
  colaborador_atualizado: "atualizou o colaborador",
  colaborador_inativado: "inativou o colaborador",
  cliente_criado: "cadastrou a empresa",
  cliente_atualizado: "atualizou a empresa",
  cliente_inativado: "inativou a empresa",
};

type DatedLabel = { expires_at?: string | null; expires_on: string };

export function expiryOf(label: DatedLabel): Date {
  return new Date(label.expires_at ?? `${label.expires_on}T23:59:59`);
}

export function expiryWindow(label: DatedLabel, now: Date): ExpiryWindow | null {
  const expiry = expiryOf(label).getTime();
  if (!Number.isFinite(expiry)) return null;
  if (expiry <= now.getTime()) return "expired";
  if (expiry <= endOfDay(now).getTime()) return "today";
  if (expiry <= endOfDay(addDays(now, 3)).getTime()) return "three";
  if (expiry <= endOfDay(addDays(now, 7)).getTime()) return "seven";
  return "all";
}

export function productCount(
  labels: Pick<OperationalLabel, "client_id" | "product_id" | "product_name">[],
) {
  return new Set(
    labels.map((label) => `${label.client_id}:${label.product_id ?? label.product_name}`),
  ).size;
}

export function remainingTime(label: DatedLabel, now: Date) {
  const minutes = Math.ceil((expiryOf(label).getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return "Já venceu";
  if (minutes < 60) return `Vence em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Vence em ${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`;
  const days = Math.floor(hours / 24);
  return `Vence em ${days} dia${days === 1 ? "" : "s"}`;
}
