import test from "node:test";
import assert from "node:assert/strict";
import { assessHealth, rankPortfolio, type PortfolioRow } from "../src/lib/portfolio.ts";

const now = new Date("2026-10-26T12:00:00Z");
const row = (patch: Partial<PortfolioRow> = {}): PortfolioRow => ({
  id: "a",
  name: "Empresa A",
  status: "ativa",
  expired_open: 0,
  expiring_soon: 0,
  issued: 20,
  issued_prev: 18,
  settled: 10,
  settled_prev: 10,
  discarded: 1,
  discarded_prev: 1,
  late_settled: 0,
  received_without_lot: 0,
  last_issued_at: "2026-10-25T12:00:00Z",
  checks: 4,
  top_discard_reason: null,
  top_products: [],
  ...patch,
});

test("empresa em dia fica verde sem motivos", () => {
  const health = assessHealth(row(), now);
  assert.equal(health.level, "ok");
  assert.deepEqual(health.reasons, []);
  assert.equal(health.daysWithoutIssuing, 1);
});

test("vencido sem baixa é sempre crítico e vem antes dos demais motivos", () => {
  const health = assessHealth(row({ expired_open: 2, late_settled: 1 }), now);
  assert.equal(health.level, "critical");
  assert.equal(health.reasons[0], "2 produtos vencidos sem baixa na cozinha");
  assert.equal(health.reasons[1], "1 baixa registrada depois do vencimento");
});

test("descarte alto pede atenção com o motivo principal e mostra a tendência", () => {
  const health = assessHealth(
    row({
      settled: 10,
      discarded: 3,
      settled_prev: 10,
      discarded_prev: 1,
      top_discard_reason: "vencido",
    }),
    now,
  );
  assert.equal(health.level, "attention");
  assert.deepEqual(health.reasons, ["Descarte em 30% das baixas (principal motivo: vencido)"]);
  assert.equal(health.discardTrend, "worse");
  // Poucas baixas não bastam para calcular taxa nem tendência.
  const few = assessHealth(row({ settled: 3, discarded: 3 }), now);
  assert.equal(few.discardRate, null);
  assert.equal(few.level, "ok");
});

test("parada de uso, falta de conferência e recebido sem lote pedem atenção", () => {
  assert.deepEqual(assessHealth(row({ last_issued_at: "2026-10-16T12:00:00Z" }), now).reasons, [
    "Sem emitir etiquetas há 10 dias",
  ]);
  assert.deepEqual(assessHealth(row({ last_issued_at: null, issued: 0 }), now).reasons, [
    "Ainda não emitiu etiquetas",
  ]);
  assert.deepEqual(assessHealth(row({ checks: 0, issued: 12 }), now).reasons, [
    "Nenhuma conferência pelo QR Code no período",
  ]);
  assert.equal(assessHealth(row({ checks: 0, issued: 5 }), now).level, "ok");
  assert.deepEqual(assessHealth(row({ received_without_lot: 3 }), now).reasons, [
    "3 recebimentos sem lote informado",
  ]);
});

test("empresa suspensa sai do semáforo e vai para o fim da lista", () => {
  const ranked = rankPortfolio(
    [
      row({ id: "s", name: "Suspensa", status: "suspensa", expired_open: 9 }),
      row({ id: "ok", name: "Em dia" }),
      row({ id: "w", name: "Atenção", late_settled: 1 }),
      row({ id: "c2", name: "Crítica B", expired_open: 1 }),
      row({ id: "c1", name: "Crítica A", expired_open: 1, late_settled: 2 }),
    ],
    now,
  );
  assert.deepEqual(
    ranked.map((item) => item.row.id),
    ["c1", "c2", "w", "ok", "s"],
  );
  assert.equal(ranked.at(-1)?.health.level, "suspended");
});

test("alerta da carteira vira ocorrência preenchida, com prioridade pela gravidade", async () => {
  const { careDraft, assessHealth: assess } = await import("../src/lib/portfolio.ts");
  const critical = row({
    expired_open: 5,
    checks: 0,
    issued: 24,
    top_products: [{ name: "Açúcar união", count: 5 }],
  });
  const draft = careDraft(critical, assess(critical, now), 30);
  assert.equal(draft?.priority, "alta");
  assert.equal(draft?.title, "Carteira: 5 produtos vencidos sem baixa na cozinha");
  assert.equal(draft?.reason, "processo");
  assert.equal(draft?.product_name, "Açúcar união");
  assert.match(
    draft?.description ?? "",
    /últimos 30 dias:\n- 5 produtos vencidos sem baixa na cozinha\n- Nenhuma conferência pelo QR Code no período\nProdutos que mais vencem ou são descartados: Açúcar união \(5\)\./,
  );
  const idle = row({ last_issued_at: null, issued: 0 });
  const idleDraft = careDraft(idle, assess(idle, now), 30);
  assert.equal(idleDraft?.priority, "normal");
  assert.equal(idleDraft?.reason, "orientacao");
  assert.equal(careDraft(row(), assess(row(), now), 30), null);
});
