import { useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_NAMES, type RecentAction } from "@/lib/dashboard";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PageLoading } from "@/components/PaginationControls";
export function RecentActivities({
  revision,
  onAction,
}: {
  revision: number;
  onAction: (action: RecentAction) => void;
}) {
  const load = useCallback(async (_offset: number, _size: number, signal: AbortSignal) => {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5)
      .abortSignal(signal);
    if (error) throw error;
    return { rows: data ?? [], total: data?.length ?? 0 };
  }, []);
  const list = usePaginatedQuery("recent", load, revision);
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Últimas ações de gestão</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Abra uma ação para consultar os campos alterados e o registro de origem.
      </p>
      {list.loading || list.error ? (
        <PageLoading error={list.error} retry={list.reload} />
      ) : (
        <div className="mt-4 space-y-2">
          {list.rows.map((row) => {
            const metadata =
              row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? row.metadata
                : {};
            const name = typeof metadata.name === "string" ? metadata.name : "registro";
            return (
              <button
                key={row.id}
                className="w-full rounded-xl border p-4 text-left text-sm transition-colors hover:bg-secondary/30"
                onClick={() =>
                  onAction({
                    ...row,
                    client_id: row.client_id ?? "",
                    source: "activity",
                    event_type: row.action,
                    entity_name: name,
                    label_id: "",
                    label: null,
                    quantity: 0,
                  })
                }
              >
                <strong>{row.user_name ?? "Usuário não identificado"}</strong>{" "}
                {EVENT_NAMES[row.action] ?? "registrou uma ação em"} {name}.
                <time className="mt-2 block text-xs text-muted-foreground">
                  {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
                </time>
              </button>
            );
          })}
          {!list.rows.length && (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma ação de gestão registrada.</p>
          )}
        </div>
      )}
    </section>
  );
}
