import assert from "node:assert/strict";
import test from "node:test";
import { workspaceSearch } from "../src/lib/workspace-search.ts";

test("atalho preserva empresa, cadastro e janela válidos", () => {
  const empresa = "22222222-2222-4222-8222-222222222222";
  const registro = "33333333-3333-4333-8333-333333333333";
  assert.deepEqual(workspaceSearch({ empresa, registro, painel: "products", janela: "three" }), {
    empresa,
    registro,
    painel: "products",
    janela: "three",
  });
});
test("atalho ignora parâmetros inválidos e destinos externos", () => {
  assert.deepEqual(
    workspaceSearch({
      empresa: "or(id.eq.secret)",
      registro: [],
      painel: "https://example.test",
      janela: "unknown",
    }),
    { empresa: undefined, registro: undefined, painel: undefined, janela: undefined },
  );
});
test("acompanhamento e consulta sem parâmetros são aceitos", () => {
  assert.equal(workspaceSearch({ painel: "acompanhamento" }).painel, "acompanhamento");
  assert.equal(workspaceSearch({}).painel, undefined);
});

test("identificadores são normalizados antes da validação de carteira", () => {
  assert.equal(
    workspaceSearch({ empresa: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }).empresa,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
});
