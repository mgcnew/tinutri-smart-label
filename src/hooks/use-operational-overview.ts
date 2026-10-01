import { addDays, endOfDay } from "date-fns";
import { expiryRange } from "@/lib/list-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OperationalLabel, RecentAction } from "@/lib/dashboard";

export function useOperationalOverview(enabled: boolean, scope: string[] | null, revision: number) {
  const [labels, setLabels] = useState<OperationalLabel[]>([]);
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const scopeKey = scope === null ? "master" : [...scope].sort().join(",");

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setNow(new Date()), 30000);
    setNow(new Date());
    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let alive = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    setLabelsError(null);
    setActionsError(null);
    // Escopo adicional no cliente; RLS continua sendo a autoridade no banco.
    const clientIds = scopeKey === "master" ? null : scopeKey.split(",").filter(Boolean);
    const loadLabels = async () => {
      if (clientIds?.length === 0) return [];
      const rows: OperationalLabel[] = [];
      // Dashboard needs only compact priority rows through the next seven days.
      // Full validity records belong to the independently paginated list.
      let offset = 0;
      while (true) {
        let query = supabase
          .from("issued_labels")
          .select(
            "id,client_id,client_name,product_id,product_name,lot_number,expires_on,expires_at,storage_condition,responsible_name",
            { count: "exact" },
          )
          .eq("print_status", "confirmada")
          .eq("label_status", "ativa")
          .or(expiryRange(null, endOfDay(addDays(new Date(), 7))))
          .order("expires_at", { ascending: true, nullsFirst: false })
          .order("id")
          .range(offset, offset + 199)
          .abortSignal(controller.signal);
        if (clientIds) query = query.in("client_id", clientIds);
        const { data, count, error } = await query;
        if (error) throw error;
        if (controller.signal.aborted) throw new Error("Tempo excedido");
        const page = data ?? [];
        rows.push(...(page as OperationalLabel[]));
        offset += page.length;
        if (count !== null && offset >= count) break;
        if (!page.length) {
          if (count !== null && offset < count) throw new Error("Resposta incompleta");
          break;
        }
      }
      return rows as OperationalLabel[];
    };
    const loadActions = async () => {
      if (clientIds?.length === 0) return [];
      let query = supabase
        .from("label_events")
        .select("*,label:issued_labels(id,product_name,client_name,lot_number)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(40)
        .abortSignal(controller.signal);
      if (clientIds) query = query.in("client_id", clientIds);
      let activityQuery = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40)
        .abortSignal(controller.signal);
      if (clientIds) activityQuery = activityQuery.in("client_id", clientIds);
      const [eventsResult, activityResult] = await Promise.all([query, activityQuery]);
      if (eventsResult.error) throw eventsResult.error;
      if (activityResult.error) throw activityResult.error;
      const eventRows = ((eventsResult.data ?? []) as RecentAction[]).map((event) => ({
        ...event,
        source: "label" as const,
      }));
      const activityRows: RecentAction[] = (activityResult.data ?? [])
        .filter((event) => event.client_id !== null)
        .map((event) => {
          const metadata =
            event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
              ? event.metadata
              : {};
          return {
            ...event,
            client_id: event.client_id!,
            source: "activity",
            label_id: "",
            event_type: event.action,
            entity_name: typeof metadata.name === "string" ? metadata.name : undefined,
            quantity: 1,
            label: null,
          };
        });
      return [...eventRows, ...activityRows].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      );
    };
    void Promise.allSettled([loadLabels(), loadActions()])
      .then(([labelResult, actionResult]) => {
        if (!alive) return;
        if (labelResult.status === "fulfilled") {
          setLabels(labelResult.value);
          setUpdatedAt(new Date());
        } else {
          setLabels([]);
          setUpdatedAt(null);
          setLabelsError("Não foi possível consultar as validades. Tente atualizar o panorama.");
        }
        if (actionResult.status === "fulfilled") setActions(actionResult.value);
        else {
          setActions([]);
          setActionsError(
            "Não foi possível consultar as últimas ações. Tente atualizar o panorama.",
          );
        }
        setLoading(false);
        setNow(new Date());
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [enabled, scopeKey, revision, attempt]);

  return {
    labels,
    actions,
    loading,
    labelsError,
    actionsError,
    updatedAt,
    now,
    reload: () => setAttempt((value) => value + 1),
  };
}
