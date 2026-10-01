import { addDays, endOfDay, format } from "date-fns";
import type { ExpiryWindow } from "@/lib/dashboard";

/** Literal accent-insensitive PostgreSQL regexp. PostgREST imatch ignores case. */
export function searchPattern(value: string) {
  const accents: Record<string, string> = {
    a: "[aáàâãä]",
    e: "[eéèêë]",
    i: "[iíìîï]",
    o: "[oóòôõö]",
    u: "[uúùûü]",
    c: "[cç]",
    n: "[nñ]",
  };
  return [
    ...value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase(),
  ]
    .map((char) => accents[char] ?? char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("");
}
export const filterLiteral = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
export function searchColumns(columns: string[], value: string) {
  const pattern = filterLiteral(searchPattern(value));
  return columns.map((column) => `${column}.imatch.${pattern}`).join(",");
}
export const scopeKey = (scope: string[] | null) =>
  scope === null ? "master" : [...scope].sort().join(",");
export const scopeIds = (key: string) => (key === "master" ? null : key.split(",").filter(Boolean));

/** Timestamp boundaries also cover legacy records whose expiry is a date only. */
export function expiryRange(after: Date | null, until: Date | null) {
  const timestamp = [
    "expires_at.not.is.null",
    ...(after ? [`expires_at.gt.${after.toISOString()}`] : []),
    ...(until ? [`expires_at.lte.${until.toISOString()}`] : []),
  ];
  const legacy = ["expires_at.is.null"];
  if (after)
    legacy.push(
      `expires_on.gte.${format(addDays(after, after.getTime() >= endOfDay(after).getTime() - 999 ? 1 : 0), "yyyy-MM-dd")}`,
    );
  if (until)
    legacy.push(
      `expires_on.lte.${format(addDays(until, until.getTime() < endOfDay(until).getTime() - 999 ? -1 : 0), "yyyy-MM-dd")}`,
    );
  return `and(${timestamp.join(",")}),and(${legacy.join(",")})`;
}
export function windowRange(window: ExpiryWindow, now: Date): [Date | null, Date | null] {
  if (window === "expired") return [null, now];
  if (window === "today") return [now, endOfDay(now)];
  if (window === "three") return [endOfDay(now), endOfDay(addDays(now, 3))];
  if (window === "seven") return [endOfDay(addDays(now, 3)), endOfDay(addDays(now, 7))];
  return [null, null];
}
