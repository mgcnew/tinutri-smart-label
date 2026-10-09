import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useState } from "react";
import { format, startOfDay, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { EVENT_NAMES, type RecentAction } from "@/lib/dashboard";
import { searchPattern } from "@/lib/list-query";
import { Heading, Field } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
import { Button } from "@/components/ui/button";
export function ActivitiesPanel({
  revision,
  initialClient = "",
  onAction,
}: {
  revision: number;
  initialClient?: string;
  onAction: (action: RecentAction) => void;
}) {
  const [client, setClient] = useState(initialClient);
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [date, setDate] = useState("");
  const term = useDebouncedValue(actor);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      let q = supabase
        .from("activity_logs")
        .select("*,company:clients(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (client) q = q.eq("client_id", client);
      if (term) q = q.filter("user_name", "imatch", searchPattern(term));
      if (entity) q = q.eq("entity_type", entity);
      if (date) {
        const start = startOfDay(new Date(`${date}T00:00:00`));
        q = q
          .gte("created_at", start.toISOString())
          .lt("created_at", addDays(start, 1).toISOString());
      }
      const { data, count, error } = await q;
      if (error || count === null) throw error ?? new Error("Count");
      return { rows: data ?? [], total: count };
    },
    [client, term, entity, date],
  );
  const list = usePaginatedQuery(JSON.stringify([client, term, entity, date]), load, revision);
  return (
    <section className="space-y-6">
      <Heading
        title="Atividades"
        description="Consulte quem alterou cada registro e veja os detalhes da ação."
      />
      <div className="master-filter-grid rounded-2xl border bg-card p-4">
        <RemoteSelect label="Empresa" value={client} onChange={setClient} />
        <Field label="Pesquisar pessoa">
          <input
            type="search"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Nome de quem realizou a ação"
          />
        </Field>
        <Field label="Registro">
          <SystemSelect value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Todos</option>
            <option value="client">Empresa</option>
            <option value="user">Usuário</option>
            <option value="product">Produto</option>
            <option value="collaborator">Colaborador</option>
            <option value="care">Acompanhamento</option>
          </SystemSelect>
        </Field>
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {list.loading || list.error ? (
        <PageLoading error={list.error} retry={list.reload} />
      ) : !list.rows.length ? (
        <div className="master-empty">Nenhuma atividade neste filtro.</div>
      ) : (
        <div className="grid gap-3">
          {list.rows.map((row) => {
            const metadata =
              row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? row.metadata
                : {};
            const name = typeof metadata.name === "string" ? metadata.name : "registro";
            return (
              <article key={row.id} className="master-list-row">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">
                    <strong>{row.user_name ?? "Usuário não identificado"}</strong>{" "}
                    {EVENT_NAMES[row.action] ?? "registrou uma ação em"} <strong>{name}</strong>.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {row.company?.name ?? "Gestão de acessos"} ·{" "}
                    {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    onAction({
                      ...row,
                      source: "activity",
                      event_type: row.action,
                      entity_name: name,
                      label_id: "",
                      label: null,
                      quantity: 0,
                      client_id: row.client_id ?? "",
                    } as RecentAction)
                  }
                >
                  Detalhes da ação
                </Button>
              </article>
            );
          })}
        </div>
      )}
      {!list.error && (
        <PaginationControls
          page={list.page}
          size={list.size}
          total={list.total}
          loading={list.loading}
          onPageChange={list.setPage}
          onSizeChange={list.setSize}
          label="ações"
        />
      )}
    </section>
  );
}
