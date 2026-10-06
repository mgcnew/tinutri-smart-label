import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAuditReportHtml, countByStatus } from "../src/lib/audit-report.ts";

const rows = [
  ["Padaria X", "Presunto", "L1", "01/10/2026 10:00", "04/10/2026 10:00", "João", "ativa", "confirmada", ""],
  ["Padaria X", "Queijo", "L2", "01/10/2026 11:00", "03/10/2026 11:00", "Maria", "descartada", "confirmada", "Vencido"],
  ["Padaria X", "Leite", "L3", "01/10/2026 12:00", "05/10/2026 12:00", "João", "ativa", "confirmada", ""],
];

test("conta etiquetas por situação, da mais frequente para a menos", () => {
  assert.deepEqual(countByStatus(rows), [["ativa", 2], ["descartada", 1]]);
});

test("escapa HTML em qualquer campo", () => {
  const html = buildAuditReportHtml({ title: "T", filters: ["<b>x</b>"], generatedAt: "agora", rows: [["<script>alert(1)</script>", "", "", "", "", "", "", "", ""]] });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("sinaliza quando o relatório foi limitado", () => {
  const html = buildAuditReportHtml({ title: "T", filters: [], generatedAt: "agora", rows, truncated: true });
  assert.ok(html.includes("limitado"));
  assert.ok(html.includes("Sem filtros"));
});
