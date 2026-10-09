import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDigest } from "../supabase/functions/_shared/digest.ts";

test("vencida domina o título e abre a lista de vencidas", () => {
  const d = buildDigest({ expired: 2, today: 3, soon: 1, sample: ["Presunto", "Queijo"] });
  assert.equal(d.title, "2 etiquetas vencidas");
  assert.equal(d.body, "2 vencidas · 3 vencem hoje · 1 vence em breve\nPresunto, Queijo +4");
  assert.equal(d.urgent, true);
  assert.equal(d.url, "/?painel=validades&janela=expired");
});

test("só hoje é urgente e abre as de hoje", () => {
  const d = buildDigest({ expired: 0, today: 1, soon: 0, sample: ["Leite"] });
  assert.equal(d.title, "1 etiqueta vence hoje");
  assert.equal(d.body, "1 vence hoje\nLeite");
  assert.equal(d.urgent, true);
  assert.equal(d.url, "/?painel=validades&janela=today");
});

test("aviso antecipado não é urgente", () => {
  const d = buildDigest({ expired: 0, today: 0, soon: 4, sample: ["A", "B", "C", "D"] });
  assert.equal(d.title, "4 etiquetas vencem em breve");
  assert.equal(d.urgent, false);
  assert.equal(d.url, "/?painel=validades&janela=all");
  assert.equal(d.body, "4 vencem em breve\nA, B, C +1");
});

test("nomes repetidos aparecem uma vez", () => {
  const d = buildDigest({ expired: 3, today: 0, soon: 0, sample: ["Presunto", "Presunto ", "Presunto"] });
  assert.equal(d.body, "3 vencidas\nPresunto +2");
});
