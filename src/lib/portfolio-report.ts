import { escapeHtml } from "./audit-report.ts";
import type { Health, PortfolioRow } from "./portfolio.ts";
import { discardReasonName } from "./settlement.ts";

export type CareEntry = {
  kind: string;
  title: string;
  status: string;
  created_at: string;
  resolution: string | null;
};

const LEVEL_TEXT: Record<Health["level"], string> = {
  critical: "Crítica",
  attention: "Atenção",
  ok: "Em dia",
  suspended: "Suspensa",
};
const CARE_KIND: Record<string, string> = {
  ocorrencia: "Ocorrência",
  visita: "Visita",
  tarefa: "Tarefa",
};
const CARE_STATUS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const shortDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

/**
 * Relatório do período para a nutricionista enviar ao cliente: situação, indicadores, produtos que mais
 * vencem, o acompanhamento registrado e as recomendações. Documento HTML para imprimir ou salvar em PDF;
 * todo texto vindo do banco ou digitado é escapado.
 */
export function buildPortfolioReportHtml(input: {
  row: PortfolioRow;
  health: Health;
  days: number;
  generatedAt: Date;
  consultant: string;
  care: CareEntry[];
  recommendations: string;
}) {
  const { row, health, days, generatedAt } = input;
  const start = new Date(generatedAt.getTime() - days * 86_400_000);
  const previousRate = row.settled_prev > 0 ? row.discarded_prev / row.settled_prev : null;
  const indicators: [string, string, string?][] = [
    ["Produtos vencidos sem baixa", String(row.expired_open)],
    ["Vencem nos próximos 3 dias", String(row.expiring_soon)],
    ["Etiquetas emitidas", String(row.issued), `período anterior: ${row.issued_prev}`],
    ["Baixas registradas", String(row.settled), `período anterior: ${row.settled_prev}`],
    [
      "Descarte sobre as baixas",
      pct(health.discardRate),
      row.top_discard_reason
        ? `principal motivo: ${discardReasonName(row.top_discard_reason).toLowerCase()}`
        : previousRate !== null
          ? `período anterior: ${pct(previousRate)}`
          : undefined,
    ],
    ["Baixas depois do vencimento", String(row.late_settled)],
    ["Conferências pelo QR Code", String(row.checks)],
    ["Recebimentos sem lote", String(row.received_without_lot)],
    ["Última emissão", row.last_issued_at ? shortDate(row.last_issued_at) : "Nenhuma"],
  ];
  const reasons = health.reasons.length
    ? `<ul>${health.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
    : "<p>Nenhum ponto de atenção no período.</p>";
  const products = row.top_products.length
    ? `<ol>${row.top_products
        .map((product) => `<li>${escapeHtml(product.name)} (${product.count})</li>`)
        .join("")}</ol>`
    : "<p>Nenhum produto vencido ou descartado no período.</p>";
  const care = input.care.length
    ? `<table><thead><tr><th>Data</th><th>Tipo</th><th>Assunto</th><th>Situação</th><th>Resultado</th></tr></thead><tbody>${input.care
        .map(
          (entry) =>
            `<tr><td>${shortDate(entry.created_at)}</td><td>${escapeHtml(CARE_KIND[entry.kind] ?? entry.kind)}</td><td>${escapeHtml(entry.title)}</td><td>${escapeHtml(CARE_STATUS[entry.status] ?? entry.status)}</td><td>${escapeHtml(entry.resolution?.trim() || "—")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>Nenhum registro de acompanhamento no período.</p>";
  const recommendations = input.recommendations.trim()
    ? `<p class="pre">${escapeHtml(input.recommendations.trim())}</p>`
    : "<p>—</p>";
  const title = `Relatório de acompanhamento · ${row.name}`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{size:A4;margin:16mm}
body{font:12px/1.55 Arial,Helvetica,sans-serif;color:#1d2b24}
header{border-bottom:2px solid #007a46;padding-bottom:10px;margin-bottom:14px}
h1{font-size:18px;margin:0 0 4px}
h2{font-size:13px;margin:18px 0 6px;color:#005e36}
.meta{color:#4a5a51;margin:0}
.level{display:inline-block;margin-top:8px;padding:2px 10px;border-radius:6px;font-weight:700}
.level-critical{background:#fff6f5;color:#a5322a}.level-attention{background:#fff4e9;color:#934412}
.level-ok{background:#f3faf5;color:#25623d}.level-suspended{background:#f1f3f2;color:#4a5a51}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #d6dfd9;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f3f7f4}
td.num{font-weight:700;white-space:nowrap}
.note{color:#4a5a51;font-size:11px}
.pre{white-space:pre-wrap}
tr{break-inside:avoid}
footer{margin-top:22px;border-top:1px solid #d6dfd9;padding-top:8px;color:#4a5a51;font-size:10.5px}
</style></head><body>
<header>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Período: ${shortDate(start.toISOString())} a ${shortDate(generatedAt.toISOString())} (últimos ${days} dias) · Consultoria: ${escapeHtml(input.consultant || "TiNutri")}</p>
<span class="level level-${health.level}">Situação: ${LEVEL_TEXT[health.level]}</span>
</header>
<h2>Pontos de atenção</h2>
${reasons}
<h2>Indicadores do período</h2>
<table><tbody>${indicators
    .map(
      ([label, value, note]) =>
        `<tr><th>${escapeHtml(label)}</th><td class="num">${escapeHtml(value)}</td><td class="note">${escapeHtml(note ?? "")}</td></tr>`,
    )
    .join("")}</tbody></table>
<h2>Produtos que mais vencem ou são descartados</h2>
${products}
<h2>Acompanhamento da consultoria</h2>
${care}
<h2>Recomendações</h2>
${recommendations}
<footer>Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} pelo TiNutri Smart Label®, a partir das etiquetas, baixas, conferências e registros de acompanhamento do sistema.</footer>
</body></html>`;
}
