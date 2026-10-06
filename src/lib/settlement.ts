export type Settlement = "utilizada" | "consumida" | "descartada";

/** Motivos de descarte: o código vai para issued_labels.closed_reason e alimenta o relatório de perdas. */
export const DISCARD_REASONS = [
  { code: "vencido", name: "Vencido" },
  { code: "sobra", name: "Sobra / excesso de produção" },
  { code: "contaminacao", name: "Suspeita de contaminação" },
  { code: "temperatura", name: "Temperatura inadequada" },
  { code: "embalagem", name: "Embalagem danificada" },
  { code: "outro", name: "Outro motivo" },
] as const;

export type DiscardReasonCode = (typeof DISCARD_REASONS)[number]["code"];

export const NOTE_MAX = 120;

export const discardReasonName = (code: string) => DISCARD_REASONS.find((r) => r.code === code)?.name ?? "Não informado";

/** "outro" exige uma descrição; os demais ignoram a observação para manter os códigos agrupáveis. */
export function formatCloseReason(code: string, note = ""): string | null {
  if (!DISCARD_REASONS.some((r) => r.code === code)) return null;
  const text = note.trim().slice(0, NOTE_MAX);
  if (code === "outro") return text.length >= 2 ? `outro: ${text}` : null;
  return code;
}

export function parseCloseReason(value: string | null | undefined): { code: string; note: string } {
  if (!value) return { code: "", note: "" };
  const [code, ...rest] = value.split(":");
  return { code: code.trim(), note: rest.join(":").trim() };
}

export type LossRow = { product_name: string; closed_reason: string | null; client_name?: string | null };

/** Resumo de descartes: total, por motivo e ranking de produtos, do maior para o menor. */
export function summarizeLosses(rows: LossRow[]) {
  const byReason = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const row of rows) {
    const reason = discardReasonName(parseCloseReason(row.closed_reason).code);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    byProduct.set(row.product_name, (byProduct.get(row.product_name) ?? 0) + 1);
  }
  const sorted = (map: Map<string, number>) => [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total: rows.length, byReason: sorted(byReason), byProduct: sorted(byProduct) };
}
