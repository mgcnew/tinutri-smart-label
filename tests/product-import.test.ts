import assert from "node:assert/strict";
import test from "node:test";
import { parseProductImport, PRODUCT_IMPORT_TEMPLATE } from "../src/lib/product-import.ts";

test("modelo com BOM e separador de planilha brasileira", () => {
  const [product] = parseProductImport(PRODUCT_IMPORT_TEMPLATE);
  assert.equal(product.name, "Arroz cozido");
  assert.equal(product.requires_lot, false);
  assert.equal(product.shelf_life_days, 3);
});
test("CSV com vírgulas, aspas escapadas e observação em várias linhas", () => {
  const [product] = parseProductImport(
    'produto,categoria,validade_dias,observacoes\n"Arroz, integral",Preparações,0,"Texto ""citado""\nOutra linha"',
  );
  assert.equal(product.name, "Arroz, integral");
  assert.equal(product.notes, 'Texto "citado"\nOutra linha');
});
test("lote e inspeção", () => {
  const [product] = parseProductImport(
    "produto;categoria;validade_dias;exige_lote;tipo_inspecao;numero_inspecao\nCarne;Carnes;7;sim;sif;123",
  );
  assert.equal(product.requires_lot, true);
  assert.equal(product.inspection_type, "SIF");
});
test("rejeita arquivos inválidos antes de gravar", () => {
  for (const source of [
    "produto;categoria;validade_dias\nArroz;Preparações;-1",
    "produto;categoria;validade_dias\nArroz;Preparações;1.5",
    "produto;categoria;validade_dias\nArroz;Preparações;3651",
    "produto;categoria;validade_dias\nArroz;Preparações;3\narroz;Preparações;3",
    "produto;categoria;validade_dias;tipo_inspecao\nCarne;Carnes;3;SIF",
    'produto;categoria;validade_dias\n"Arroz;Preparações;3',
    "produto;categoria;validade_dias\nArroz;Preparações;3;extra",
    "produto;categoria;validade_dias",
  ])
    assert.throws(() => parseProductImport(source));
});
test("limita quantidade de registros", () => {
  assert.throws(() =>
    parseProductImport(
      "produto;categoria;validade_dias\n" +
        Array.from({ length: 501 }, (_, i) => `Produto ${i};Categoria;3`).join("\n"),
    ),
  );
});
