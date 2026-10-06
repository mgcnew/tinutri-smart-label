export const AUDIT_HEADER = ["Empresa", "Produto", "Lote", "Emitida em", "Validade", "Responsável", "Situação", "Impressão", "Motivo do descarte"];

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Contagem por situação da etiqueta, para o resumo no topo do relatório. */
export function countByStatus(rows: string[][], statusIndex = 6) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row[statusIndex] ?? "", (counts.get(row[statusIndex] ?? "") ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Documento HTML do relatório de auditoria, pronto para imprimir ou salvar em PDF. Todo texto é escapado. */
export function buildAuditReportHtml(input: { title: string; filters: string[]; generatedAt: string; rows: string[][]; truncated?: boolean }) {
  const summary = countByStatus(input.rows)
    .map(([status, count]) => `<li><strong>${count}</strong> ${escapeHtml(status || "sem situação")}</li>`)
    .join("");
  const body = input.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const filters = input.filters.length ? input.filters.map(escapeHtml).join(" · ") : "Sem filtros";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font:11px Arial,Helvetica,sans-serif;color:#111}
h1{font-size:16px;margin:0 0 4px}
.meta{color:#444;margin:0 0 8px}
ul{display:flex;gap:16px;list-style:none;padding:0;margin:8px 0 12px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#eee}
thead{display:table-header-group}
tr{break-inside:avoid}
.note{margin-top:8px;color:#444}
</style></head><body>
<h1>${escapeHtml(input.title)}</h1>
<p class="meta">${filters}<br>Gerado em ${escapeHtml(input.generatedAt)} · ${input.rows.length} etiqueta${input.rows.length === 1 ? "" : "s"}</p>
<ul>${summary}</ul>
<table><thead><tr>${AUDIT_HEADER.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
${input.truncated ? '<p class="note">Relatório limitado às etiquetas mais recentes; refine o filtro para ver as demais.</p>' : ""}
</body></html>`;
}
