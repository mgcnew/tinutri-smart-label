import test from "node:test";
import assert from "node:assert/strict";
import {
  contractDraft,
  contractPending,
  contractPrintHtml,
  EMPTY_PROVIDER,
  EMPTY_TERMS,
} from "../src/lib/contract-template.ts";
const company = {
  name: "Empresa teste",
  legal_name: "Empresa Teste Ltda.",
  cnpj: "00.000.000/0001-00",
  address: "Rua de teste, 10",
  city: "São Paulo",
  state: "SP",
  responsible_name: "Responsável teste",
  email: "contato@example.test",
  phone: "11999999999",
  plan: "anual",
  subscription_started_on: "2026-10-16",
};

test("contrato usa o cadastro e distingue preço equivalente do total do ciclo", () => {
  const body = contractDraft(company);
  assert.ok(body.includes("Empresa Teste Ltda."));
  assert.ok(body.includes("00.000.000/0001-00"));
  assert.ok(body.replace(/\s/g, " ").includes("Valor total por ciclo: R$ 598,80"));
  assert.ok(body.includes("sem parcelamento presumido"));
  assert.ok(body.includes("16/10/2026"));
  assert.ok(body.includes("10. DISPOSIÇÕES FINAIS"));
  assert.ok(body.length < 30000);
  assert.throws(() => contractDraft({ ...company, plan: "premium" }), /Atualize o plano/);
});
test("dados da prestadora permanecem pendentes sem identidade ou SLA inventados", () => {
  const body = contractDraft(company);
  const pending = contractPending(body);
  assert.ok(pending.includes("razão social da TiNutri"));
  assert.ok(pending.includes("CNPJ da TiNutri"));
  assert.ok(pending.includes("canal de suporte"));
  assert.ok(!body.includes("99,9%"));
  assert.ok(body.includes("MINUTA PARA REVISÃO — NÃO ASSINADA"));
});
test("condições e prestadora são incorporadas sem confundir adesão com vigência", () => {
  const body = contractDraft(
    company,
    {
      ...EMPTY_TERMS,
      startsOn: "2026-11-01",
      firstDueOn: "2026-10-25",
      payment: "pix",
      renewal: "automatica",
      supportChannel: "suporte@example.test",
      supportHours: "Dias úteis, das 9h às 17h",
      exportDays: "30",
    },
    {
      ...EMPTY_PROVIDER,
      legalName: "Prestadora Teste Ltda.",
      cnpj: "11.111.111/0001-11",
      representative: "Representante teste",
      email: "prestadora@example.test",
      address: "Endereço de teste",
      phone: "1100000000",
    },
  );
  assert.ok(body.includes("01/11/2026"));
  assert.ok(body.includes("25/10/2026"));
  assert.ok(body.includes("Forma de pagamento: Pix"));
  assert.ok(body.includes("Renovação: automática por períodos iguais"));
  assert.ok(body.includes("Prestadora Teste Ltda."));
  assert.ok(!contractPending(body).includes("CNPJ da TiNutri"));
  assert.ok(body.includes("30 dias corridos"));
  assert.throws(
    () => contractDraft(company, { ...EMPTY_TERMS, exportDays: "-1" }),
    /entre 1 e 365/,
  );
  assert.ok(contractDraft(company).includes("sem renovação automática"));
});
test("impressão escapa marcação e scripts provenientes dos dados e do texto", () => {
  const html = contractPrintHtml(
    '<script>alert("title")</script>',
    'Texto\n\n<img src=x onerror="alert(1)"> & dados',
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp; dados"));
  assert.ok(html.includes("Minuta para revisão · não assinada"));
  assert.deepEqual(contractPending("[PENDENTE: CNPJ] [PENDENTE: CNPJ]"), ["CNPJ"]);
});
