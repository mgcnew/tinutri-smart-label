import { useCallback, useEffect, useState } from "react";
import { addDays, endOfDay } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { expiryRange, scopeIds, scopeKey } from "@/lib/list-query";
import type { AlertCounts } from "@/lib/alert-plan";

const REFRESH_MS = 60_000;

/**
 * Painel de alertas de validade: contagem por gravidade, sem carregar listas de etiquetas.
 * Só considera etiquetas ativas com impressão confirmada, dentro das empresas do usuário.
 */
export function useAlerts(
  enabled: boolean,
  scope: string[] | null,
  revision: number,
  soonDays: number,
) {
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const key = scopeKey(scope);

  const load = useCallback(async () => {
    const ids = scopeIds(key);
    if (ids?.length === 0) return { counts: { expired: 0, today: 0, soon: 0 } };
    const now = new Date();
    const base = () => {
      let q = supabase
        .from("issued_labels")
        .select("id", { count: "exact", head: true })
        .eq("print_status", "confirmada")
        .eq("label_status", "ativa");
      if (ids) q = q.in("client_id", ids);
      return q;
    };
    const [expired, today, soon] = await Promise.all([
      base().or(expiryRange(null, now)).limit(1),
      base()
        .or(expiryRange(now, endOfDay(now)))
        .limit(1),
      base()
        .or(expiryRange(endOfDay(now), endOfDay(addDays(now, soonDays))))
        .limit(1),
    ]);
    for (const result of [expired, today, soon])
      if (result.error || result.count === null)
        throw result.error ?? new Error("Contagem indisponível");
    return {
      counts: { expired: expired.count ?? 0, today: today.count ?? 0, soon: soon.count ?? 0 },
    };
  }, [key, soonDays]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () =>
      void load()
        .then((result) => {
          if (alive) {
            setCounts(result.counts);
          }
        })
        .catch(() => undefined);
    run();
    // Aba escondida não consulta o banco; ao voltar, o evento abaixo atualiza na hora.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, REFRESH_MS);
    // Voltar para a aba depois de um tempo atualiza na hora, sem esperar o próximo ciclo.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load, revision]);

  return { counts };
}
