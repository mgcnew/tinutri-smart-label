import assert from "node:assert/strict";
import { test } from "node:test";

import { planSound, REPEAT_MS } from "../src/lib/alert-plan.ts";

const zero = { expired: 0, today: 0, soon: 0 };
const never = { urgent: 0, today: 0 };
const NOW = 10_000_000;

test("primeira leitura sem pendência grave fica em silêncio", () => {
  assert.equal(planSound(null, { ...zero, soon: 4 }, never, NOW), null);
});

test("primeira leitura com vencida toca o som urgente; só hoje toca o de hoje", () => {
  assert.equal(planSound(null, { ...zero, expired: 1, today: 2 }, never, NOW), "urgent");
  assert.equal(planSound(null, { ...zero, today: 2 }, never, NOW), "today");
});

test("piora toca na hora, pela gravidade", () => {
  assert.equal(planSound(zero, { ...zero, soon: 1 }, { urgent: NOW, today: NOW }, NOW), "soon");
  assert.equal(planSound(zero, { ...zero, today: 1 }, { urgent: NOW, today: NOW }, NOW), "today");
  assert.equal(
    planSound(zero, { ...zero, expired: 1 }, { urgent: NOW, today: NOW }, NOW),
    "urgent",
  );
});

test("sem novidade repete vencidas a cada 5 min e hoje a cada 15", () => {
  const state = { ...zero, expired: 2, today: 1 };
  assert.equal(
    planSound(state, state, { urgent: NOW - REPEAT_MS.urgent + 1, today: NOW }, NOW),
    null,
  );
  assert.equal(
    planSound(state, state, { urgent: NOW - REPEAT_MS.urgent, today: NOW }, NOW),
    "urgent",
  );
  const onlyToday = { ...zero, today: 1 };
  assert.equal(
    planSound(onlyToday, onlyToday, { urgent: 0, today: NOW - REPEAT_MS.today + 1 }, NOW),
    null,
  );
  assert.equal(
    planSound(onlyToday, onlyToday, { urgent: 0, today: NOW - REPEAT_MS.today }, NOW),
    "today",
  );
});

test("baixar etiquetas não toca nada", () => {
  assert.equal(
    planSound({ ...zero, expired: 3 }, { ...zero, expired: 1 }, { urgent: NOW, today: NOW }, NOW),
    null,
  );
});

test("vencimento por breve não repete", () => {
  const state = { ...zero, soon: 5 };
  assert.equal(planSound(state, state, never, NOW), null);
});
