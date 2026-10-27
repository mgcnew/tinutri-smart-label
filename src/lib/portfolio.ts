import { discardReasonName } from "./settlement.ts";

/** Indicadores de uma empresa no período, como devolvidos por portfolio_health (SQL 31). */
export type PortfolioRow = {
  id: string;
  name: string;
  status: string;
  expired_open: number;
  expiring_soon: number;
  issued: number;
  issued_prev: number;
  settled: number;
  settled_prev: number;
  discarded: number;
  discarded_prev: number;
  late_settled: number;
  received_without_lot: number;
  last_issued_at: string | null;
  checks: number;
  top_discard_reason: string | null;
  top_products: { name: string; count: number }[];
};

export type HealthLevel = "critical" | "attention" | "ok" | "suspended";
export type Trend = "better" | "worse" | "stable" | null;
export type Health = {
  level: HealthLevel;
  /** Motivos em ordem de gravidade, em linguagem da cozinha. */
  reasons: string[];
  discardRate: number | null;
  discardTrend: Trend;
  daysWithoutIssuing: number | null;
};

/** Pesos combinados com a consultoria: vencido sem baixa é sempre crítico; o resto pede atenção. */
export const HEALTH_RULES = {
  discardRate: 0.15,
  minSettledForRate: 5,
  idleDays: 7,
  minIssuedForChecks: 10,
  trendPoints: 0.05,
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rate = (part: number, total: number) => (total > 0 ? part / total : null);

export function assessHealth(row: PortfolioRow, now = new Date()): Health {
  const discardRate =
    row.settled >= HEALTH_RULES.minSettledForRate ? rate(row.discarded, row.settled) : null;
  const previousRate =
    row.settled_prev >= HEALTH_RULES.minSettledForRate
      ? rate(row.discarded_prev, row.settled_prev)
      : null;
  const discardTrend: Trend =
    discardRate === null || previousRate === null
      ? null
      : discardRate - previousRate >= HEALTH_RULES.trendPoints
        ? "worse"
        : previousRate - discardRate >= HEALTH_RULES.trendPoints
          ? "better"
          : "stable";
  const daysWithoutIssuing = row.last_issued_at
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(row.last_issued_at)) / 86_400_000))
    : null;

  if (row.status === "suspensa")
    return {
      level: "suspended",
      reasons: ["Empresa suspensa: acompanhamento pausado."],
      discardRate,
      discardTrend,
      daysWithoutIssuing,
    };

  const critical: string[] = [];
  const attention: string[] = [];
  if (row.expired_open > 0)
    critical.push(
      `${plural(row.expired_open, "produto vencido", "produtos vencidos")} sem baixa na cozinha`,
    );
  if (row.late_settled > 0)
    attention.push(
      `${plural(row.late_settled, "baixa registrada", "baixas registradas")} depois do vencimento`,
    );
  if (discardRate !== null && discardRate >= HEALTH_RULES.discardRate) {
    const reason = row.top_discard_reason
      ? ` (principal motivo: ${discardReasonName(row.top_discard_reason).toLowerCase()})`
      : "";
    attention.push(`Descarte em ${Math.round(discardRate * 100)}% das baixas${reason}`);
  }
  if (daysWithoutIssuing === null) attention.push("Ainda não emitiu etiquetas");
  else if (daysWithoutIssuing >= HEALTH_RULES.idleDays)
    attention.push(`Sem emitir etiquetas há ${daysWithoutIssuing} dias`);
  if (row.checks === 0 && row.issued >= HEALTH_RULES.minIssuedForChecks)
    attention.push("Nenhuma conferência pelo QR Code no período");
  if (row.received_without_lot > 0)
    attention.push(
      `${plural(row.received_without_lot, "recebimento", "recebimentos")} sem lote informado`,
    );

  return {
    level: critical.length ? "critical" : attention.length ? "attention" : "ok",
    reasons: [...critical, ...attention],
    discardRate,
    discardTrend,
    daysWithoutIssuing,
  };
}

const LEVEL_ORDER: Record<HealthLevel, number> = { critical: 0, attention: 1, ok: 2, suspended: 3 };

/** Quem precisa de mais atenção primeiro: gravidade, quantidade de motivos, vencidos e nome. */
export function rankPortfolio(rows: PortfolioRow[], now = new Date()) {
  return rows
    .map((row) => ({ row, health: assessHealth(row, now) }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.health.level] - LEVEL_ORDER[b.health.level] ||
        b.health.reasons.length - a.health.reasons.length ||
        b.row.expired_open - a.row.expired_open ||
        a.row.name.localeCompare(b.row.name, "pt-BR"),
    );
}

/** Prefixo das ocorrências criadas pela carteira: identifica as que ainda estão abertas e evita duplicar. */
export const PORTFOLIO_CARE_PREFIX = "Carteira:";

export type CareDraft = {
  client_id: string;
  kind: "ocorrencia";
  status: "aberta";
  priority: "alta" | "normal";
  title: string;
  description: string;
  reason: "descarte" | "processo" | "orientacao";
  product_name: string | null;
};

/** Ocorrência preenchida a partir dos motivos do semáforo, para a nutricionista registrar o que viu e agir. */
export function careDraft(row: PortfolioRow, health: Health, days: number): CareDraft | null {
  if (health.level !== "critical" && health.level !== "attention") return null;
  const [first] = health.reasons;
  const reason = first.startsWith("Descarte")
    ? "descarte"
    : first.startsWith("Sem emitir") || first.startsWith("Ainda não emitiu")
      ? "orientacao"
      : "processo";
  const products = row.top_products
    .map((product) => `${product.name} (${product.count})`)
    .join(", ");
  const description = [
    `Pontos identificados pelo painel da carteira nos últimos ${days} dias:`,
    ...health.reasons.map((item) => `- ${item}`),
    products ? `Produtos que mais vencem ou são descartados: ${products}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    client_id: row.id,
    kind: "ocorrencia",
    status: "aberta",
    priority: health.level === "critical" ? "alta" : "normal",
    title: `${PORTFOLIO_CARE_PREFIX} ${first}`.slice(0, 160),
    description: description.slice(0, 5000),
    reason,
    product_name: row.top_products[0]?.name.slice(0, 120) ?? null,
  };
}
