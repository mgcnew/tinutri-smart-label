import assert from "node:assert/strict";
import { test } from "node:test";
import { expiryOf, expiryWindow, productCount, remainingTime } from "../src/lib/dashboard.ts";

process.env.TZ = "America/Sao_Paulo";
const now = new Date("2026-10-01T15:00:00-03:00");
const label = (expires_at: string | null, expires_on = "2026-10-01") => ({
  expires_at,
  expires_on,
});

test("vencimento é pelo instante, inclusive quando já venceu hoje", () => {
  assert.equal(expiryWindow(label("2026-10-01T14:59:59-03:00"), now), "expired");
  assert.equal(expiryWindow(label("2026-10-01T15:00:00-03:00"), now), "expired");
  assert.equal(expiryWindow(label("2026-10-01T15:00:01-03:00"), now), "today");
});

test("hoje, próximos 3 dias e 4 a 7 dias não se sobrepõem", () => {
  for (const [date, expected] of [
    ["2026-10-01T23:59:59-03:00", "today"],
    ["2026-10-02T00:00:00-03:00", "three"],
    ["2026-10-04T23:59:59-03:00", "three"],
    ["2026-10-05T00:00:00-03:00", "seven"],
    ["2026-10-08T23:59:59-03:00", "seven"],
    ["2026-10-09T00:00:00-03:00", "all"],
  ])
    assert.equal(expiryWindow(label(date), now), expected);
});

test("registros antigos sem timestamp vencem ao final da data; valores inválidos não viram contagem zero", () => {
  assert.equal(expiryWindow(label(null), now), "today");
  assert.equal(expiryOf(label(null)).getHours(), 23);
  assert.equal(expiryWindow(label("invalid"), now), null);
});

test("contagem agrupa cópias de um produto, preservando a separação por empresa", () => {
  assert.equal(
    productCount([
      { client_id: "a", product_id: "p", product_name: "Presunto" },
      { client_id: "a", product_id: "p", product_name: "Presunto" },
      { client_id: "b", product_id: "p", product_name: "Presunto" },
    ]),
    2,
  );
});

test("tempo restante diferencia vencido, minutos, horas e dias", () => {
  assert.equal(remainingTime(label("2026-10-01T14:00:00-03:00"), now), "Já venceu");
  assert.equal(remainingTime(label("2026-10-01T15:30:00-03:00"), now), "Vence em 30 min");
  assert.equal(remainingTime(label("2026-10-01T16:30:00-03:00"), now), "Vence em 1h 30min");
  assert.equal(remainingTime(label("2026-10-03T15:00:00-03:00"), now), "Vence em 2 dias");
});
