import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCloseReason, parseCloseReason, summarizeLosses } from "../src/lib/settlement.ts";

test("motivo conhecido vira o próprio código e ignora observação", () => {
  assert.equal(formatCloseReason("sobra", "qualquer coisa"), "sobra");
});

test("'outro' exige descrição e a mantém", () => {
  assert.equal(formatCloseReason("outro", ""), null);
  assert.equal(formatCloseReason("outro", "  caiu no chão "), "outro: caiu no chão");
});

test("código desconhecido é rejeitado", () => {
  assert.equal(formatCloseReason("xyz"), null);
});

test("parse separa código e observação, inclusive com dois-pontos", () => {
  assert.deepEqual(parseCloseReason("outro: a: b"), { code: "outro", note: "a: b" });
  assert.deepEqual(parseCloseReason(null), { code: "", note: "" });
});

test("resumo conta por motivo e produto, ordenado", () => {
  const s = summarizeLosses([
    { product_name: "Presunto", closed_reason: "vencido" },
    { product_name: "Presunto", closed_reason: "vencido" },
    { product_name: "Queijo", closed_reason: "outro: x" },
    { product_name: "Queijo", closed_reason: null },
  ]);
  assert.equal(s.total, 4);
  assert.deepEqual(s.byReason[0], { name: "Vencido", count: 2 });
  assert.deepEqual(s.byProduct, [{ name: "Presunto", count: 2 }, { name: "Queijo", count: 2 }]);
  assert.ok(s.byReason.some((r) => r.name === "Não informado" && r.count === 1));
});
