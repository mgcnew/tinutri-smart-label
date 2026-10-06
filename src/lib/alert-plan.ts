export type AlertCounts = { expired: number; today: number; soon: number };
export type SoundLevel = "urgent" | "today" | "soon";

/** Enquanto houver vencida sem baixa o som insiste; vence hoje repete com mais folga. */
export const REPEAT_MS = { urgent: 5 * 60_000, today: 15 * 60_000 } as const;

export type LastPlayed = { urgent: number; today: number };

/**
 * Decide qual som tocar, se algum. Piora (mais vencidas, mais vencendo hoje, mais por vencer) toca na hora;
 * sem novidade, só repete as pendências graves no intervalo.
 */
export function planSound(prev: AlertCounts | null, next: AlertCounts, last: LastPlayed, now: number): SoundLevel | null {
  if (!prev) {
    if (next.expired > 0) return "urgent";
    if (next.today > 0) return "today";
    return null;
  }
  if (next.expired > prev.expired) return "urgent";
  if (next.today > prev.today) return "today";
  if (next.soon > prev.soon) return "soon";
  if (next.expired > 0 && now - last.urgent >= REPEAT_MS.urgent) return "urgent";
  if (next.today > 0 && now - last.today >= REPEAT_MS.today) return "today";
  return null;
}
