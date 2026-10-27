import test from "node:test";
import assert from "node:assert/strict";
import { assessHealth, type PortfolioRow } from "../src/lib/portfolio.ts";
import { buildPortfolioReportHtml } from "../src/lib/portfolio-report.ts";

const generatedAt = new Date("2026-10-26T15:00:00Z");
const row: PortfolioRow = {
  id: "a",
  name: "Cozinha <Teste>",
  status: "ativa",
  expired_open: 2,
  expiring_soon: 1,
  issued: 24,
  issued_prev: 18,
  settled: 10,
  settled_prev: 8,
  discarded: 3,
  discarded_prev: 1,
  late_settled: 1,
  received_without_lot: 0,
  last_issued_at: "2026-10-25T12:00:00Z",
  checks: 0,
  top_discard_reason: "temperatura",
  top_products: [{ name: "Molho & cia", count: 3 }],
};

const build = (patch: Partial<Parameters<typeof buildPortfolioReportHtml>[0]> = {}) =>
  buildPortfolioReportHtml({
    row,
    health: assessHealth(row, generatedAt),
    days: 30,
    generatedAt,
    consultant: "Priscila",
    care: [
      {
        kind: "ocorrencia",
        title: "Carteira: 2 produtos vencidos",
        status: "concluida",
        created_at: "2026-10-20T12:00:00Z",
        resolution: "Treinamento de PVPS feito",
      },
    ],
    recommendations: "Conferir a geladeira 2\ntoda manhã.",
    ...patch,
  });

test("relatório traz situação, motivos, indicadores, produtos, acompanhamento e recomendações", () => {
  const html = build();
  assert.match(html, /Situação: Crítica/);
  assert.match(html, /2 produtos vencidos sem baixa na cozinha/);
  assert.match(
    html,
    /<th>Descarte sobre as baixas<\/th><td class="num">30%<\/td><td class="note">principal motivo: temperatura inadequada<\/td>/,
  );
  assert.match(
    html,
    /Etiquetas emitidas<\/th><td class="num">24<\/td><td class="note">período anterior: 18/,
  );
  assert.match(
    html,
    /Período: 26\/09\/2026 a 26\/10\/2026 \(últimos 30 dias\) · Consultoria: Priscila/,
  );
  assert.match(
    html,
    /<td>Ocorrência<\/td><td>Carteira: 2 produtos vencidos<\/td><td>Concluída<\/td><td>Treinamento de PVPS feito<\/td>/,
  );
  assert.match(html, /<p class="pre">Conferir a geladeira 2\ntoda manhã.<\/p>/);
});

test("escapa tudo o que vem do banco ou é digitado", () => {
  const html = build({ recommendations: "<script>alert(1)</script>" });
  assert.match(html, /Cozinha &lt;Teste&gt;/);
  assert.match(html, /Molho &amp; cia \(3\)/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("períodos sem registros mostram mensagens claras", () => {
  const quiet = {
    ...row,
    expired_open: 0,
    late_settled: 0,
    discarded: 0,
    checks: 3,
    top_products: [],
    top_discard_reason: null,
  };
  const html = buildPortfolioReportHtml({
    row: quiet,
    health: assessHealth(quiet, generatedAt),
    days: 7,
    generatedAt,
    consultant: "",
    care: [],
    recommendations: "  ",
  });
  assert.match(html, /Situação: Em dia/);
  assert.match(html, /Nenhum ponto de atenção no período/);
  assert.match(html, /Nenhum produto vencido ou descartado no período/);
  assert.match(html, /Nenhum registro de acompanhamento no período/);
  assert.match(html, /Consultoria: TiNutri/);
});
