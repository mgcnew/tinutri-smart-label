import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, endOfDay } from "date-fns";
import {
  expiryRange,
  filterLiteral,
  searchColumns,
  searchPattern,
  windowRange,
} from "../src/lib/list-query.ts";

process.env.TZ = "America/Sao_Paulo";

test("busca por acentos preserva pontuação literal e não cria operadores", () => {
  const pattern = new RegExp(searchPattern("  Acucar, (50%) + [teste]  "), "iu");
  assert(pattern.test("Açúcar, (50%) + [teste]"));
  assert(!pattern.test("Acucar, 50 + teste"));
  const special = 'nome",id.eq.123\\texto';
  assert.equal(JSON.parse(filterLiteral(special)), special);
  assert(searchColumns(["name", "category"], "são").includes("[aáàâãä]"));
});

test("janela de três e sete dias compartilha limite exclusivo", () => {
  const now = new Date("2026-10-01T18:00:00Z");
  const today = windowRange("today", now);
  const three = windowRange("three", now);
  const seven = windowRange("seven", now);
  assert.equal(today[0]?.getTime(), now.getTime());
  assert.equal(today[1]?.getTime(), three[0]?.getTime());
  assert.equal(three[1]?.getTime(), seven[0]?.getTime());
  assert.equal(seven[1]?.getTime(), endOfDay(addDays(now, 7)).getTime());
  assert.deepEqual(windowRange("all", now), [null, null]);
});

test("validade antiga sem horário só vence ao final da data local", () => {
  const afternoon = new Date("2026-10-01T18:00:00Z");
  assert(expiryRange(null, afternoon).includes("expires_on.lte.2026-09-30"));
  assert(
    expiryRange(afternoon, endOfDay(afternoon)).includes(
      "expires_on.gte.2026-10-01,expires_on.lte.2026-10-01",
    ),
  );
  assert(expiryRange(endOfDay(afternoon), null).includes("expires_on.gte.2026-10-02"));
  assert(expiryRange(null, afternoon).includes(`expires_at.lte.${afternoon.toISOString()}`));
  assert(expiryRange(afternoon, null).includes(`expires_at.gt.${afternoon.toISOString()}`));
});
