import { useCallback, useEffect, useState } from "react";
import { addDays, endOfDay } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { expiryRange, scopeIds, scopeKey } from "@/lib/list-query";
import type { AlertCounts } from "@/lib/alert-plan";

const REFRESH_MS = 60_000;

export type AlertItem = { id: string; product_name: string; client_name: string; expires_at: string | null; expires_on: string };

/**
 * Painel de alertas de validade: contagem por gravidade e as etiquetas mais urgentes.
 * Só considera etiquetas ativas com impressão confirmada, dentro das empresas do usuário.
 */
export function useAlerts(enabled: boolean, scope: string[] | null, revision: number, soonDays: number) {
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [items, setItems] = useState<AlertItem[]>([]);
  const key = scopeKey(scope);

  const load = useCallback(async () => {
    const ids = scopeIds(key);
    if (ids?.length === 0) return { counts: { expired: 0, today: 0, soon: 0 }, items: [] as AlertItem[] };
    const now = new Date();
    const base = () => {
      let q = supabase.from("issued_labels").select("id,product_name,client_name,expires_at,expires_on", { count: "exact" }).eq("print_status", "confirmada").eq("label_status", "ativa");
      if (ids) q = q.in("client_id", ids);
      return q;
    };
    const [expired, today, soon, urgent] = await Promise.all([
      base().or(expiryRange(null, now)).limit(1),
      base().or(expiryRange(now, endOfDay(now))).limit(1),
      base().or(expiryRange(endOfDay(now), endOfDay(addDays(now, soonDays)))).limit(1),
      base().or(expiryRange(null, endOfDay(now))).order("expires_at", { ascending: true, nullsFirst: false }).order("id").limit(6),
    ]);
    for (const result of [expired, today, soon, urgent]) if (result.error || result.count === null) throw result.error ?? new Error("Contagem indisponível");
    return {
      counts: { expired: expired.count ?? 0, today: today.count ?? 0, soon: soon.count ?? 0 },
      items: (urgent.data ?? []) as AlertItem[],
    };
  }, [key, soonDays]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () => void load().then((result) => { if (alive) { setCounts(result.counts); setItems(result.items); } }).catch(() => undefined);
    run();
    const timer = setInterval(run, REFRESH_MS);
    // Voltar para a aba depois de um tempo atualiza na hora, sem esperar o próximo ciclo.
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, load, revision]);

  return { counts, items };
}
