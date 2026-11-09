import test from "node:test";
import assert from "node:assert/strict";
import { equipmentOffer, equipmentSummary } from "../src/lib/equipment.ts";
import {
  BILLING_PLANS,
  billingPlan,
  centsInput,
  displayDate,
  money,
  parseCents,
} from "../src/lib/billing.ts";

test("preços usam centavos e preservam os totais de cada período", () => {
  assert.deepEqual(
    Object.keys(BILLING_PLANS).map((cycle) => billingPlan(cycle)!.totalCents),
    [5990, 16470, 59880],
  );
  assert.equal(money(16470).replace(/\s/g, " "), "R$ 164,70");
});
test("tabela editada e valor negociado mudam o preço efetivo", () => {
  const prices = { mensal: 6990, trimestral: 6490, anual: 5990 };
  assert.equal(billingPlan("trimestral", prices)!.totalCents, 19470);
  assert.equal(billingPlan("trimestral", prices)!.negotiated, false);
  const custom = billingPlan("anual", prices, 4500)!;
  assert.equal(custom.monthlyCents, 4500);
  assert.equal(custom.totalCents, 54000);
  assert.equal(custom.negotiated, true);
  assert.equal(billingPlan("anual", prices, null)!.monthlyCents, 5990);
});
test("valores digitados em reais viram centavos", () => {
  assert.equal(parseCents("59,90"), 5990);
  assert.equal(parseCents("R$ 1.059,90"), 105990);
  assert.equal(parseCents("59.9"), 5990);
  assert.equal(parseCents("60"), 6000);
  for (const text of ["", "abc", "1.059", "5,999", "-10"]) assert.equal(parseCents(text), null);
  assert.equal(centsInput(5990), "59,90");
  assert.equal(centsInput(null), "");
});
test("planos antigos não são convertidos implicitamente", () => {
  for (const name of ["essencial", "profissional", "premium", "", "toString"])
    assert.equal(billingPlan(name), undefined);
});
test("adesão ausente não assume a data de cadastro e datas não mudam de dia", () => {
  assert.equal(displayDate(null), "Não informada");
  assert.equal(displayDate("2026-10-16"), "16/10/2026");
  assert.equal(displayDate("2026-10-16T00:00:00Z"), "16/10/2026");
});
test("impressora segue a mesma regra do banco: catálogo, valor negociado e quantidade", () => {
  const models = [
    {
      id: "m1",
      name: "PDA X1",
      sale_cents: 129000,
      loan_monthly_cents: 3990,
      replacement_cents: 150000,
      active: true,
    },
  ];
  assert.equal(equipmentOffer({ equipment_mode: "nenhum" }, models), null);
  assert.equal(equipmentOffer({ equipment_mode: "venda", equipment_model_id: "x" }, models), null);
  const loan = equipmentOffer(
    { equipment_mode: "comodato", equipment_model_id: "m1", equipment_quantity: 2 },
    models,
  )!;
  assert.equal(loan.totalCents, 7980);
  assert.equal(loan.minMonths, 12);
  const sale = equipmentOffer(
    { equipment_mode: "venda", equipment_model_id: "m1", equipment_custom_cents: 119000 },
    models,
  )!;
  assert.equal(sale.totalCents, 119000);
  assert.equal(sale.negotiated, true);
  assert.equal(sale.minMonths, 0);
  assert.match(
    equipmentSummary(loan).replace(/\s/g, " "),
    /2 × PDA X1 em comodato · R\$ 79,80\/mês/,
  );
  assert.equal(equipmentSummary(null), "Sem impressora");
});
