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

test("etapas de etiquetas compartilham seção sem alterar os destinos antigos", async () => {
  const { isLabelTab } = await import("../src/lib/workspace-search.ts");
  for (const painel of ["emit", "validades", "history"] as const) {
    assert.equal(workspaceSearch({ painel }).painel, painel);
    assert.equal(isLabelTab(painel), true);
  }
  assert.equal(isLabelTab("products"), false);
});
test("atalho de empresas Master aceita apenas seções e UUIDs internos", async () => {
  const { masterSearch, masterCompaniesUrl } = await import("../src/lib/workspace-search.ts");
  const empresa = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  assert.deepEqual(masterSearch({ secao: "empresas", empresa }), {
    secao: "empresas",
    empresa: empresa.toLowerCase(),
  });
  assert.deepEqual(masterSearch({ secao: "https://example.test", empresa: "../usuarios" }), {
    secao: undefined,
    empresa: undefined,
  });
  assert.equal(
    masterCompaniesUrl(empresa),
    `/admin?secao=empresas&empresa=${empresa.toLowerCase()}`,
  );
  assert.equal(masterCompaniesUrl("../usuarios"), "/admin?secao=empresas");
});
