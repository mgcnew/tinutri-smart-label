import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeShelfByStorage, shelfDaysFor } from "../src/lib/shelf-life.ts";

const product = { shelf_life_days: 3, shelf_life_by_storage: { "CONGELADO ≤ -18 °C": 90, "TEMPERATURA AMBIENTE": 0 } };

test("usa o prazo da conservação quando existe", () => {
  assert.equal(shelfDaysFor(product, "CONGELADO ≤ -18 °C"), 90);
});

test("zero dias por conservação é respeitado, não vira o padrão", () => {
  assert.equal(shelfDaysFor(product, "TEMPERATURA AMBIENTE"), 0);
});

test("sem conservação ou sem prazo específico usa o padrão", () => {
  assert.equal(shelfDaysFor(product, ""), 3);
  assert.equal(shelfDaysFor(product, "REFRIGERADO ≤ 5 °C"), 3);
  assert.equal(shelfDaysFor({ shelf_life_days: 5 }, "CONGELADO ≤ -18 °C"), 5);
});

test("descarta valores inválidos vindos do banco", () => {
  assert.deepEqual(normalizeShelfByStorage({ a: 1.5, b: -1, c: 4000, d: "3", e: 7 }), { e: 7 });
  assert.deepEqual(normalizeShelfByStorage(null), {});
  assert.deepEqual(normalizeShelfByStorage([1, 2]), {});
});
