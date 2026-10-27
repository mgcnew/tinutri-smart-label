import { cloneElement, useCallback, useId, useState, type ReactElement } from "react";
import { addDays, format, isValid, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock3, Copy, Download, FileText, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { supabase } from "@/integrations/supabase/client";
import { scopeKey, scopeIds, searchPattern } from "@/lib/list-query";
import type { OperationalLabel } from "@/lib/dashboard";
import { downloadCsv } from "@/lib/management";
import { FixedCompany } from "@/components/FixedCompany";
import { discardReasonName, parseCloseReason } from "@/lib/settlement";
import { AUDIT_HEADER, buildAuditReportHtml } from "@/lib/audit-report";
import { printHtml } from "@/lib/print-html";

const EXPORT_PAGE = 1000;
const EXPORT_MAX = 5000;

// Mesmos filtros para a lista e para a exportação, para que o CSV traga exatamente o que a tela filtra.
function applyFilters<
  Q extends {
    in: (column: string, values: string[]) => Q;
    filter: (column: string, operator: string, value: string) => Q;
    gte: (column: string, value: string) => Q;
    lt: (column: string, value: string) => Q;
  },
>(base: Q, ids: string[] | null, terms: string): Q {
  const [product, responsible, client, date, lot] = JSON.parse(terms) as string[];
  let query = base;
  if (ids) query = query.in("client_id", ids);
  for (const [column, value] of [
    ["product_name", product],
    ["responsible_name", responsible],
    ["client_name", client],
    ["lot_number", lot],
  ])
    if (value) query = query.filter(column, "imatch", searchPattern(value));
  if (date) {
    const beginning = startOfDay(new Date(`${date}T00:00:00`));
    if (isValid(beginning))
      query = query
        .gte("issued_at", beginning.toISOString())
        .lt("issued_at", addDays(beginning, 1).toISOString());
  }
  return query;
}

export function HistoryPanel({
  scope,
  clientName,
  revision,
  onReprint,
  onDuplicate,
  embedded = false,
}: {
  embedded?: boolean;
  scope: string[] | null;
  /** Nome da empresa quando o acesso é a uma só. */
  clientName?: string;
  revision: number;
  onReprint: (record: OperationalLabel) => void;
  onDuplicate: (record: OperationalLabel) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [lotQuery, setLotQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const terms = useDebouncedValue(
    JSON.stringify([
      productQuery.trim(),
      responsibleQuery.trim(),
      clientQuery.trim(),
      dateQuery,
      lotQuery.trim(),
    ]),
  );
  const accessKey = scopeKey(scope);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const ids = scopeIds(accessKey);
      if (ids?.length === 0) return { rows: [], total: 0 };
      let query = supabase
        .from("issued_labels")
        .select("*", { count: "exact" })
        .order("issued_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      query = applyFilters(query, ids, terms);
      const { data, count, error } = await query;
      if (error || count === null) throw error ?? new Error("Contagem indisponível");
      return { rows: (data ?? []) as OperationalLabel[], total: count };
    },
    [accessKey, terms],
  );
  const listing = usePaginatedQuery(JSON.stringify([accessKey, terms]), load, revision);
  const filtered = listing.rows;
  const toRows = (rows: OperationalLabel[]) =>
    rows.map((r) => [
      r.client_name,
      r.product_name,
      r.lot_number ?? "",
      format(new Date(r.issued_at), "dd/MM/yyyy HH:mm"),
      r.expires_at ? format(new Date(r.expires_at), "dd/MM/yyyy HH:mm") : r.expires_on,
      r.responsible_name,
      r.label_status,
      r.print_status,
      r.label_status === "descartada"
        ? discardReasonName(parseCloseReason(r.closed_reason).code)
        : "",
    ]);
  // Busca todas as páginas do filtro atual (até EXPORT_MAX) para o CSV e para o relatório.
  const exportRows = async (kind: "csv" | "print") => {
    if (exporting) return;
    setExporting(true);
    setExportNote("");
    try {
      const ids = scopeIds(accessKey);
      const rows: OperationalLabel[] = [];
      while (ids?.length !== 0 && rows.length < EXPORT_MAX) {
        const { data, error } = await applyFilters(
          supabase
            .from("issued_labels")
            .select("*")
            .order("issued_at", { ascending: false })
            .order("id", { ascending: false })
            .range(rows.length, rows.length + EXPORT_PAGE - 1),
          ids,
          terms,
        );
        if (error) throw error;
        rows.push(...((data ?? []) as OperationalLabel[]));
        if ((data?.length ?? 0) < EXPORT_PAGE) break;
      }
      const table = toRows(rows);
      const truncated = rows.length >= EXPORT_MAX;
      if (kind === "csv") {
        downloadCsv(`etiquetas-${format(new Date(), "yyyy-MM-dd")}.csv`, [AUDIT_HEADER, ...table]);
      } else {
        const [product, responsible, client, date, lot] = JSON.parse(terms) as string[];
        const filters = [
          client && `Empresa: ${client}`,
          product && `Produto: ${product}`,
          lot && `Lote: ${lot}`,
          responsible && `Responsável: ${responsible}`,
          date && `Data: ${format(new Date(`${date}T00:00:00`), "dd/MM/yyyy")}`,
        ].filter((value): value is string => Boolean(value));
        printHtml(
          buildAuditReportHtml({
            title: "TiNutri Smart Label® · Relatório de etiquetas",
            filters,
            generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
            rows: table,
            truncated,
          }),
        );
      }
      if (truncated)
        setExportNote(
          `Limitado às ${EXPORT_MAX.toLocaleString("pt-BR")} etiquetas mais recentes; refine o filtro para ver as demais.`,
        );
    } catch {
      setExportNote("Não foi possível gerar o arquivo. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="history-page space-y-6">
      {!embedded && (
        <header className="dashboard-heading">
          <div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Etiquetas emitidas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Consulte todas as emissões, com filtros e páginas.
            </p>
          </div>
        </header>
      )}
      <div className="mt-7 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
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
          {scope?.length === 1 && clientName ? (
            <FixedCompany name={clientName} />
          ) : (
            <input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Pesquisar cliente"
            />
          )}
        </Field>
        <Field label="Lote">
          <input
            value={lotQuery}
            onChange={(event) => setLotQuery(event.target.value)}
            placeholder="Rastrear lote"
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">
          {exportNote}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || listing.loading || listing.total === 0}
            onClick={() => void exportRows("print")}
          >
            <FileText />
            Relatório (PDF)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || listing.loading || listing.total === 0}
            onClick={() => void exportRows("csv")}
          >
            <Download />
            {exporting ? "Gerando…" : "Exportar CSV"}
          </Button>
        </div>
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
