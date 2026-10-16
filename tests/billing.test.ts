import test from "node:test";
import assert from "node:assert/strict";
import { BILLING_PLANS, billingPlan, displayDate, money } from "../src/lib/billing.ts";

test("preços usam centavos e preservam os totais de cada período", () => {
  assert.deepEqual(
    Object.values(BILLING_PLANS).map((plan) => plan.monthlyCents * plan.months),
    [5990, 16470, 59880],
  );
  assert.equal(money(16470).replace(/\s/g, " "), "R$ 164,70");
});
test("planos antigos não são convertidos implicitamente", () => {
  for (const name of ["essencial", "profissional", "premium", ""])
    assert.equal(billingPlan(name), undefined);
});
test("adesão ausente não assume a data de cadastro e datas não mudam de dia", () => {
  assert.equal(displayDate(null), "Não informada");
  assert.equal(displayDate("2026-10-16"), "16/10/2026");
  assert.equal(displayDate("2026-10-16T00:00:00Z"), "16/10/2026");
});
