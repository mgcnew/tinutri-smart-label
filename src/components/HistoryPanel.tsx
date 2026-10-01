import { cloneElement, useCallback, useId, useState, type ReactElement } from "react";
import { addDays, format, isValid, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock3, Copy, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { supabase } from "@/integrations/supabase/client";
import { scopeKey, scopeIds, searchPattern } from "@/lib/list-query";
import type { OperationalLabel } from "@/lib/dashboard";

export function HistoryPanel({
  scope,
  revision,
  onReprint,
  onDuplicate,
}: {
  scope: string[] | null;
  revision: number;
  onReprint: (record: OperationalLabel) => void;
  onDuplicate: (record: OperationalLabel) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const terms = useDebouncedValue(
    JSON.stringify([productQuery.trim(), responsibleQuery.trim(), clientQuery.trim(), dateQuery]),
  );
  const accessKey = scopeKey(scope);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const ids = scopeIds(accessKey);
      if (ids?.length === 0) return { rows: [], total: 0 };
      const [product, responsible, client, date] = JSON.parse(terms) as string[];
      let query = supabase
        .from("issued_labels")
        .select("*", { count: "exact" })
        .order("issued_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (ids) query = query.in("client_id", ids);
      for (const [column, value] of [
        ["product_name", product],
        ["responsible_name", responsible],
        ["client_name", client],
      ])
        if (value) query = query.filter(column, "imatch", searchPattern(value));
      if (date) {
        const beginning = startOfDay(new Date(`${date}T00:00:00`));
        if (isValid(beginning))
          query = query
            .gte("issued_at", beginning.toISOString())
            .lt("issued_at", addDays(beginning, 1).toISOString());
      }
      const { data, count, error } = await query;
      if (error || count === null) throw error ?? new Error("Contagem indisponível");
      return { rows: (data ?? []) as OperationalLabel[], total: count };
    },
    [accessKey, terms],
  );
  const listing = usePaginatedQuery(JSON.stringify([accessKey, terms]), load, revision);
  const filtered = listing.rows;
  return (
    <section className="history-page space-y-6">
      <header className="dashboard-heading">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Registros</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Etiquetas emitidas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Consulte todas as emissões, com filtros e páginas.
          </p>
        </div>
      </header>
      <div className="mt-7 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Produto"
          icon={
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
            />
          }
        >
          <input
            className="pl-9"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Pesquisar produto"
          />
        </Field>
        <Field label="Responsável">
          <input
            value={responsibleQuery}
            onChange={(event) => setResponsibleQuery(event.target.value)}
            placeholder="Pesquisar responsável"
          />
        </Field>
        <Field label="Cliente">
          <input
            value={clientQuery}
            onChange={(event) => setClientQuery(event.target.value)}
            placeholder="Pesquisar cliente"
          />
        </Field>
        <Field label="Data">
          <input
            type="date"
            value={dateQuery}
            onChange={(event) => setDateQuery(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
        {listing.loading || listing.error ? (
          <PageLoading error={listing.error} retry={listing.reload} />
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">Nenhuma etiqueta encontrada.</p>
        ) : (
          filtered.map((h) => (
            <article
              key={h.id}
              className="grid gap-4 border-b p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center"
            >
              <div>
                <strong>{h.product_name}</strong>
                <p className="text-sm text-muted-foreground">{h.client_name}</p>
              </div>
              <div className="text-sm">
                <p>{h.responsible_name}</p>
                <p className="text-xs text-muted-foreground">
                  Lote: {h.lot_number || "—"} · Aberto:{" "}
                  {format(new Date(`${h.opened_on}T12:00:00`), "dd/MM/yyyy")}
                </p>
                <p className="text-xs font-semibold text-foreground">
                  Validade: {format(new Date(`${h.expires_on}T12:00:00`), "dd/MM/yyyy")} ·{" "}
                  {h.quantity || 1} etiqueta(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.print_status === "falha"
                    ? "Impressão com falha — sem baixa"
                    : h.print_status === "preparada"
                      ? "Aguardando confirmação — sem baixa"
                      : "Saída confirmada"}
                  {(h.reprint_count ?? 0) > 0 ? ` · ${h.reprint_count} reimpressão(ões)` : ""}
                </p>
                <time className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3" />
                  {format(new Date(h.issued_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </time>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                <Button variant="outline" size="sm" onClick={() => onReprint(h)}>
                  <Printer />
                  Reimprimir
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onDuplicate(h)}>
                  <Copy />
                  Duplicar
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
      {!listing.error && (
        <PaginationControls
          page={listing.page}
          size={listing.size}
          total={listing.total}
          loading={listing.loading}
          onPageChange={listing.setPage}
          onSizeChange={listing.setSize}
          label="etiquetas"
        />
      )}
    </section>
  );
}

function Field({
  label,
  children,
  icon,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  icon?: ReactElement;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        {label}
      </label>
      <div className="relative">
        {icon}
        {cloneElement(children, { id })}
      </div>
    </div>
  );
}
