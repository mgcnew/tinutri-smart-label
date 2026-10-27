/** Prazo em dias por condição de conservação; chaves são os textos de STORAGE_PRESETS (src/lib/label.ts). */
export type ShelfLifeByStorage = Record<string, number>;

export const MAX_SHELF_DAYS = 3650;

/** Mantém só pares texto → inteiro válido: o JSON do banco não é confiável por si só. */
export function normalizeShelfByStorage(value: unknown): ShelfLifeByStorage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ShelfLifeByStorage = {};
  for (const [key, days] of Object.entries(value as Record<string, unknown>)) {
    if (typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= MAX_SHELF_DAYS)
      result[key] = days;
  }
  return result;
}

/** Dias de validade para o produto na conservação escolhida; sem prazo específico vale o padrão. */
export function shelfDaysFor(
  product: { shelf_life_days: number; shelf_life_by_storage?: unknown },
  storage: string,
): number {
  const specific = storage
    ? normalizeShelfByStorage(product.shelf_life_by_storage)[storage]
    : undefined;
  return specific ?? product.shelf_life_days;
}
