import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeIds, scopeKey } from "@/lib/list-query";

/** Audit links fetch their exact record regardless of the current list page. */
export function useFocusedEntity<T>(
  table: "clients" | "products",
  id: string | null,
  scope: string[] | null,
  onFocus: (record: T) => void,
  onError: (message: string) => void,
) {
  const applied = useRef<string | null>(null);
  const key = scopeKey(scope);
  useEffect(() => {
    if (!id || applied.current === id) return;
    const controller = new AbortController();
    let alive = true;
    const ids = scopeIds(key);
    if (ids?.length === 0) return;
    let query = supabase
      .from(table)
      .select(table === "products" ? "*,company:clients(name)" : "*")
      .eq("id", id)
      .abortSignal(controller.signal);
    if (ids) query = query.in(table === "clients" ? "id" : "client_id", ids);
    void query.maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      applied.current = id;
      if (error || !data) onError("Não foi possível abrir o cadastro solicitado.");
      else onFocus(data as T);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [table, id, key, onFocus, onError]);
}
