import assert from "node:assert/strict";
import { test } from "node:test";

import { allergenText, normalizeAllergens } from "../src/lib/allergens.ts";

test("texto segue a ordem oficial e ignora repetidos e desconhecidos", () => {
  assert.equal(allergenText(["soja", "leite", "soja", "xyz"]), "Soja, Leite");
});

test("sem alérgenos não há texto", () => {
  assert.equal(allergenText([]), undefined);
  assert.equal(allergenText(null), undefined);
  assert.deepEqual(normalizeAllergens("leite"), []);
});
