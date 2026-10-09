import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, CalendarClock, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaginationControls, PageLoading } from "@/components/PaginationControls";
import { usePaginatedQuery, useDebouncedValue } from "@/hooks/use-paginated-query";
import { scopeKey, scopeIds, searchColumns } from "@/lib/list-query";
import {
  management,
  KIND_NAMES,
  CARE_STATUS,
  errorMessage,
  type CareRecord,
} from "@/lib/management";
import { MasterModal, Field, Feedback, Heading, SaveButton } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
import { ReportModal } from "./ReportModal";
const EMPTY = {
  client_id: "",
  kind: "tarefa" as CareRecord["kind"],
  title: "",
  description: "",
  status: "aberta" as CareRecord["status"],
  priority: "normal" as CareRecord["priority"],
  assigned_to: "",
  due_on: "",
  next_visit_on: "",
  reason: "outro",
  product_name: "",
  resolution: "",
};
export function CarePanel({
  scope,
  revision = 0,
  initialClient = "",
  initialFilter = "all",
  focusedId = null,
}: {
  scope: string[] | null;
  revision?: number;
  initialClient?: string;
  initialFilter?: string;
  focusedId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [client, setClient] = useState(initialClient);
  const [kind, setKind] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState(false);
  const [target, setTarget] = useState<CareRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formId = useId();
  const key = scopeKey(scope);
  const term = useDebouncedValue(search.trim());
  useEffect(() => setClient(initialClient), [initialClient]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const ids = scopeIds(key);
      if (ids?.length === 0)
        return { rows: [], total: 0, meta: { open: 0, overdue: 0, closed: 0 } };
      const today = format(new Date(), "yyyy-MM-dd");
      const query = (head: boolean, state: string) => {
        let q = management
          .from("care_records")
          .select("*,company:clients(name)", { count: "exact", head })
          .abortSignal(signal);
        if (ids) q = q.in("client_id", ids);
        if (client) q = q.eq("client_id", client);
        if (kind) q = q.eq("kind", kind as CareRecord["kind"]);
        if (term) q = q.or(searchColumns(["title", "description", "product_name"], term));
        if (state === "abertas") q = q.neq("status", "concluida");
        else if (state === "atrasadas") q = q.neq("status", "concluida").lt("due_on", today);
        else if (state === "concluida") q = q.eq("status", "concluida");
        return q;
      };
      const [page, ...counts] = await Promise.all([
        query(false, filter)
          .order("due_on", { nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + size - 1),
        ...["abertas", "atrasadas", "concluida"].map((value) => query(true, value)),
      ]);
      const failure = page.error ?? counts.find((row) => row.error)?.error;
      if (failure) throw new Error(errorMessage(failure));
      if (page.count === null || counts.some((row) => row.count === null)) throw new Error("Count");
      return {
        rows: (page.data ?? []) as CareRecord[],
        total: page.count,
        meta: { open: counts[0].count!, overdue: counts[1].count!, closed: counts[2].count! },
      };
    },
    [key, term, client, kind, filter],
  );
  const listing = usePaginatedQuery(
    JSON.stringify([key, term, client, kind, filter]),
    load,
    revision + attempt,
  );
  const edit = useCallback((record: CareRecord) => {
    setTarget(record);
    setForm({
      client_id: record.client_id,
      kind: record.kind,
      title: record.title,
      description: record.description,
      status: record.status,
      priority: record.priority,
      assigned_to: record.assigned_to ?? "",
      due_on: record.due_on ?? "",
      next_visit_on: record.next_visit_on ?? "",
      reason: record.reason ?? "outro",
      product_name: record.product_name ?? "",
      resolution: record.resolution,
    });
    setError("");
    setOpen(true);
  }, []);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedId || applied.current === focusedId) return;
    const controller = new AbortController();
    let alive = true;
    let q = management
      .from("care_records")
      .select("*,company:clients(name)")
      .eq("id", focusedId)
      .abortSignal(controller.signal);
    const ids = scopeIds(key);
    if (ids) q = q.in("client_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    void q.maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      applied.current = focusedId;
      if (error || !data) setError("Não foi possível abrir este acompanhamento.");
      else edit(data as CareRecord);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [focusedId, key, edit]);
  const update = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (form.status === "concluida" && form.resolution.trim().length < 2) {
      setError("Registre o resultado antes de concluir.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        assigned_to: form.assigned_to || null,
        due_on: form.due_on || null,
        next_visit_on: form.kind === "visita" ? form.next_visit_on || null : null,
        reason: form.kind === "ocorrencia" ? form.reason : null,
        product_name: form.kind === "ocorrencia" ? form.product_name.trim() || null : null,
      };
      const q = target
        ? management
            .from("care_records")
            .update(payload)
            .eq("id", target.id)
            .eq("updated_at", target.updated_at)
            .select("id")
            .maybeSingle()
        : management.from("care_records").insert(payload).select("id").single();
      const { data, error } = await q;
      if (error)
        throw new Error(
          error.code === "23514"
            ? "Confira o prazo, a próxima visita e o resultado informado."
            : error.code === "P0001"
              ? error.message
              : errorMessage(error),
        );
      if (!data)
        throw new Error(
          "Este registro foi alterado por outra pessoa. Feche e atualize a lista antes de editar novamente.",
        );
      setOpen(false);
      setNotice(target ? "Acompanhamento atualizado." : "Registro criado com sucesso.");
      setAttempt((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <section className="care-page clients-page space-y-6">
      <Heading
        title="Acompanhamento"
        description="Organize orientações, ocorrências e visitas de cada empresa."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setReport(true)}>
              Relatório
            </Button>
            <Button
              className="dashboard-primary"
              onClick={() => {
                setTarget(null);
                setForm({ ...EMPTY, client_id: client });
                setError("");
                setOpen(true);
              }}
            >
              <Plus />
              Novo registro
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Em aberto", "abertas", listing.meta?.open, ClipboardList],
          ["Atrasadas", "atrasadas", listing.meta?.overdue, AlertTriangle],
          ["Concluídas", "concluida", listing.meta?.closed, CheckCircle2],
        ].map(([name, value, total, Icon]) => {
          const IconComponent = Icon as typeof ClipboardList;
          return (
            <button
              key={String(value)}
              className="master-metric rounded-xl border bg-card p-4 text-left"
              aria-pressed={filter === value}
              onClick={() => setFilter(String(value))}
            >
              <IconComponent className="size-4 text-primary" />
              <span className="mt-3 block text-xs">{String(name)}</span>
              <strong className="mt-1 block text-2xl">
                {listing.loading || listing.error ? "—" : Number(total ?? 0)}
              </strong>
            </button>
          );
        })}
      </div>
      <div className="master-filter-grid rounded-2xl border bg-card p-4">
        <Field label="Pesquisar acompanhamento">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Título, observação ou produto"
          />
        </Field>
        <RemoteSelect label="Empresa" value={client} onChange={setClient} scope={scope} />
        <Field label="Tipo">
          <SystemSelect value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(KIND_NAMES).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </SystemSelect>
        </Field>
        <Field label="Situação">
          <SystemSelect value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todas</option>
            <option value="abertas">Em aberto</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="concluida">Concluídas</option>
          </SystemSelect>
        </Field>
      </div>
      <Feedback error={!open ? error : undefined} notice={notice} />
      {listing.loading || listing.error ? (
        <PageLoading error={listing.error} retry={listing.reload} />
      ) : listing.rows.length === 0 ? (
        <div className="master-empty">Nenhum registro neste filtro.</div>
      ) : (
        <div className="grid gap-3">
          {listing.rows.map((row) => (
            <article key={row.id} className="master-list-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className="master-tag">{KIND_NAMES[row.kind]}</span>
                  <span
                    className={`master-tag ${row.status === "concluida" ? "is-green" : row.due_on && row.due_on < format(new Date(), "yyyy-MM-dd") ? "is-red" : ""}`}
                  >
                    {CARE_STATUS[row.status]}
                  </span>
                  {row.priority === "alta" && (
                    <span className="master-tag is-orange">Prioridade alta</span>
                  )}
                </div>
                <h2 className="mt-3 break-words font-semibold">{row.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{row.company?.name}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {row.description.slice(0, 220)}
                </p>
                <p className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className="flex gap-1">
                    <CalendarClock className="size-3.5" />
                    {row.due_on
                      ? format(new Date(`${row.due_on}T12:00:00`), "dd/MM/yyyy")
                      : "Sem prazo"}
                  </span>
                  <span>{row.assigned_name || "Sem responsável atribuído"}</span>
                </p>
                {row.next_visit_on && (
                  <p className="mt-2 text-xs text-primary">
                    Próxima visita:{" "}
                    {format(new Date(`${row.next_visit_on}T12:00:00`), "dd/MM/yyyy")}
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => edit(row)}>
                Abrir registro
              </Button>
            </article>
          ))}
        </div>
      )}
      {!listing.error && (
        <PaginationControls
          page={listing.page}
          size={listing.size}
          total={listing.total}
          loading={listing.loading}
          onPageChange={listing.setPage}
          onSizeChange={listing.setSize}
          label="registros"
        />
      )}
      <MasterModal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title={target ? "Editar acompanhamento" : "Novo acompanhamento"}
        description="Registre o contexto, o responsável e o prazo. A conclusão exige um resultado."
        wide
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SaveButton busy={busy} form={formId} />
          </div>
        }
      >
        <form id={formId} onSubmit={save}>
          <fieldset disabled={busy} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <RemoteSelect
                label="Empresa *"
                value={form.client_id}
                onChange={(value) =>
                  setForm((old) => ({ ...old, client_id: value, assigned_to: "" }))
                }
                required
                disabled={Boolean(target)}
                scope={scope}
                initial={
                  target?.company ? { id: target.client_id, name: target.company.name } : undefined
                }
              />
              <Field label="Tipo *">
                <SystemSelect
                  value={form.kind}
                  disabled={Boolean(target)}
                  onChange={(e) => update("kind", e.target.value as CareRecord["kind"])}
                >
                  {Object.entries(KIND_NAMES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </SystemSelect>
              </Field>
            </div>
            <Field label="Título *">
              <input
                required
                minLength={2}
                maxLength={160}
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </Field>
            <Field
              label={form.kind === "visita" ? "Observações da visita" : "Contexto e orientações"}
            >
              <textarea
                rows={4}
                maxLength={5000}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <RemoteSelect
                label="Responsável"
                kind="person"
                clientId={form.client_id}
                value={form.assigned_to}
                onChange={(value) => update("assigned_to", value)}
                disabled={!form.client_id}
                initial={
                  target?.assigned_to
                    ? { id: target.assigned_to, name: target.assigned_name || "Responsável atual" }
                    : undefined
                }
              />
              <Field
                label={
                  form.kind === "visita"
                    ? "Data da visita *"
                    : form.kind === "tarefa"
                      ? "Prazo *"
                      : "Prazo de resolução"
                }
              >
                <input
                  type="date"
                  required={form.kind !== "ocorrencia"}
                  value={form.due_on}
                  onChange={(e) => update("due_on", e.target.value)}
                />
              </Field>
              <Field label="Situação">
                <SystemSelect
                  value={form.status}
                  onChange={(e) => update("status", e.target.value as CareRecord["status"])}
                >
                  {Object.entries(CARE_STATUS).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </SystemSelect>
              </Field>
              <Field label="Prioridade">
                <SystemSelect
                  value={form.priority}
                  onChange={(e) => update("priority", e.target.value as CareRecord["priority"])}
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                </SystemSelect>
              </Field>
            </div>
            {form.kind === "ocorrencia" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Motivo">
                  <SystemSelect
                    value={form.reason}
                    onChange={(e) => update("reason", e.target.value)}
                  >
                    <option value="descarte">Descarte</option>
                    <option value="processo">Processo</option>
                    <option value="impressao">Impressão</option>
                    <option value="orientacao">Orientação</option>
                    <option value="outro">Outro</option>
                  </SystemSelect>
                </Field>
                <Field label="Produto relacionado">
                  <input
                    maxLength={120}
                    value={form.product_name}
                    onChange={(e) => update("product_name", e.target.value)}
                  />
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Este registro documenta a ocorrência. A baixa da etiqueta deve ser registrada em
                  Validades.
                </p>
              </div>
            )}
            {form.kind === "visita" && (
              <Field label="Próxima visita">
                <input
                  type="date"
                  min={form.due_on || undefined}
                  value={form.next_visit_on}
                  onChange={(e) => update("next_visit_on", e.target.value)}
                />
              </Field>
            )}
            <Field
              label={
                form.status === "concluida"
                  ? "Resultado e recomendações *"
                  : "Resultado e recomendações"
              }
            >
              <textarea
                rows={3}
                required={form.status === "concluida"}
                minLength={form.status === "concluida" ? 2 : undefined}
                maxLength={5000}
                value={form.resolution}
                onChange={(e) => update("resolution", e.target.value)}
              />
            </Field>
            <Feedback error={error} />
          </fieldset>
        </form>
      </MasterModal>
      <ReportModal
        open={report}
        onClose={() => setReport(false)}
        scope={scope}
        initialClient={client}
      />
    </section>
  );
}
