/** Alérgenos de declaração obrigatória no Brasil (RDC 26/2015). O código vai para o banco; o nome, para a etiqueta. */
export const ALLERGENS = [
  { code: "gluten", name: "Glúten (trigo, centeio, cevada, aveia)" },
  { code: "crustaceos", name: "Crustáceos" },
  { code: "ovos", name: "Ovos" },
  { code: "peixes", name: "Peixes" },
  { code: "amendoim", name: "Amendoim" },
  { code: "soja", name: "Soja" },
  { code: "leite", name: "Leite" },
  { code: "castanhas", name: "Castanhas e nozes" },
  { code: "latex", name: "Látex natural" },
] as const;

/** Texto curto para a etiqueta, sem os detalhes entre parênteses. */
const SHORT: Record<string, string> = {
  gluten: "Glúten",
  crustaceos: "Crustáceos",
  ovos: "Ovos",
  peixes: "Peixes",
  amendoim: "Amendoim",
  soja: "Soja",
  leite: "Leite",
  castanhas: "Castanhas",
  latex: "Látex",
};

/** Mantém só códigos conhecidos, sem repetição e na ordem da lista oficial. */
export function normalizeAllergens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return ALLERGENS.map((a) => a.code).filter((code) => value.includes(code));
}

/** "ALÉRGENOS: LEITE, SOJA" ou undefined quando não há nenhum. */
export function allergenText(value: unknown): string | undefined {
  const codes = normalizeAllergens(value);
  return codes.length ? codes.map((c) => SHORT[c]).join(", ") : undefined;
}
