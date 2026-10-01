import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import {
  Building2,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Search,
  UserRound,
  Mail,
  Phone,
  Power,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientQrCard } from "@/components/ClientQrCard";
import { supabase } from "@/integrations/supabase/client";
import { management, pageResult, type Company, errorMessage } from "@/lib/management";
import { useFocusedEntity } from "@/hooks/use-focused-entity";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { scopeKey, scopeIds, searchColumns, searchPattern } from "@/lib/list-query";

type Status = "ativa" | "inativa" | "suspensa";
type Client = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  city: string;
  state: string;
  active: boolean;
  status: Status;
  responsible_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  plan: string;
  public_code: string;
  created_at?: string;
  nutritionists?: string[];
};
type Props = {
  master?: boolean;
  initialFilter?: Status | "all" | "sem_responsavel";
  onInspect?: (client: Company) => void;
  onFocusHandled?: () => void;
  scope: string[] | null;
  revision: number;
  refresh: () => Promise<void>;
  focusedId: string | null;
  recordActivity: (
    action: string,
    clientId: string,
    entityType: string,
    entityId: string,
    name: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
};
const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
const EMPTY = {
  name: "",
  legal_name: "",
  cnpj: "",
  city: "",
  state: "",
  responsible_name: "",
  email: "",
  phone: "",
  address: "",
  plan: "essencial",
  status: "ativa" as Status,
};
const STATUS_LABEL = { ativa: "Ativo", inativa: "Inativo", suspensa: "Suspenso" };
const PLAN_LABEL: Record<string, string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  premium: "Premium",
};
const statusOf = (client: Client): Status =>
  client.status === "suspensa" ? "suspensa" : client.active ? "ativa" : "inativa";
export function ClientsPanel({
  scope,
  revision,
  refresh,
  recordActivity,
  focusedId,
  master = false,
  initialFilter = "all",
  onInspect,
  onFocusHandled,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all" | "sem_responsavel">(
    initialFilter,
  );
  useEffect(() => setStatusFilter(initialFilter), [initialFilter]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const newButton = useRef<HTMLButtonElement | null>(null);
  const term = useDebouncedValue(search.trim());
  const accessKey = scopeKey(scope);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const ids = scopeIds(accessKey);
      if (ids?.length === 0)
        return { rows: [], total: 0, meta: { all: 0, ativa: 0, inativa: 0, suspensa: 0 } };
      const query = (head: boolean, status: Status | "all" | "sem_responsavel") => {
        let q = supabase.from("clients").select("*", { count: "exact", head }).abortSignal(signal);
        if (ids) q = q.in("id", ids);
        if (term) {
          const digits = term.replace(/\D/g, "");
          q = q.or(
            searchColumns(["name", "legal_name", "city", "state", "cnpj"], term) +
              (digits ? `,cnpj.imatch.${digits.split("").join("[^0-9]*")}` : ""),
          );
        }
        if (status === "suspensa") q = q.eq("status", "suspensa");
        else if (status !== "all") q = q.eq("active", status === "ativa").neq("status", "suspensa");
        return q;
      };
      const masterPage = async () => {
        const digits = term.replace(/\D/g, "");
        const { data, error } = await management
          .rpc("master_directory", {
            p_kind: "empresas",
            p_search: searchPattern(term) + (digits ? `|${digits.split("").join("[^0-9]*")}` : ""),
            p_filter: statusFilter === "all" ? "" : statusFilter,
            p_offset: offset,
            p_limit: size,
          })
          .abortSignal(signal);
        if (error) throw new Error(errorMessage(error));
        const page = pageResult<Company>(data);
        return { data: page.rows, count: page.total, error: null };
      };
      const [page, ...totals] = await Promise.all([
        master
          ? masterPage()
          : query(false, statusFilter)
              .order("name")
              .order("id")
              .range(offset, offset + size - 1),
        ...(["all", "ativa", "inativa", "suspensa"] as const).map((status) => query(true, status)),
      ]);
      if (page.error || totals.some((result) => result.error))
        throw page.error ?? totals.find((result) => result.error)?.error;
      if (page.count === null || totals.some((result) => result.count === null))
        throw new Error("Contagem indisponível");
      return {
        rows: (page.data ?? []) as Client[],
        total: page.count,
        meta: {
          all: totals[0].count!,
          ativa: totals[1].count!,
          inativa: totals[2].count!,
          suspensa: totals[3].count!,
        },
      };
    },
    [accessKey, term, statusFilter, master],
  );
  const listing = usePaginatedQuery(
    JSON.stringify([accessKey, term, statusFilter, master]),
    load,
    revision,
  );
  const filtered = listing.rows;
  const counts = listing.meta ?? { all: 0, ativa: 0, inativa: 0, suspensa: 0 };
  const hasFilters = Boolean(search.trim() || statusFilter !== "all");

  const startEdit = useCallback((client: Client) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm({
      name: client.name,
      legal_name: client.legal_name ?? "",
      cnpj: client.cnpj ?? "",
      city: client.city,
      state: client.state,
      responsible_name: client.responsible_name ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
      plan: client.plan || "essencial",
      status: statusOf(client),
    });
    setEditingId(client.id);
    setEditingRecord(client);
    setError("");
    setNotice("");
    setOpen(true);
  }, []);
  useFocusedEntity("clients", focusedId, scope, startEdit, setError);
  useEffect(() => {
    if (open && focusedId === editingId) onFocusHandled?.();
  }, [open, focusedId, editingId, onFocusHandled]);
  const update = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const startNew = () => {
    returnFocus.current = newButton.current;
    setForm(EMPTY);
    setEditingId(null);
    setEditingRecord(null);
    setError("");
    setNotice("");
    setOpen(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (!form.name.trim() || !form.city.trim() || !form.state) {
      setError("Preencha nome, cidade e estado.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      cnpj: form.cnpj.trim() || null,
      city: form.city.trim(),
      state: form.state,
      responsible_name: form.responsible_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      plan: form.plan,
      active: form.status === "ativa",
      status: form.status,
    };
    try {
      const { data: saved, error: saveError } = editingId
        ? await supabase
            .from("clients")
            .update(payload)
            .eq("id", editingId)
            .select("id")
            .maybeSingle()
        : await supabase.from("clients").insert(payload).select("id").single();
      if (saveError || !saved)
        throw new Error("Não foi possível salvar. Confira os dados e tente novamente.");
      await recordActivity(
        editingId ? "cliente_atualizado" : "cliente_criado",
        saved.id,
        "client",
        saved.id,
        payload.name,
        editingId ? { ...editingRecord } : {},
        payload,
      );
      setOpen(false);
      setNotice(editingId ? "Alterações salvas com sucesso." : "Cliente cadastrado com sucesso.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };
  const inactivate = async (client: Client) => {
    if (inactivatingId || !confirm(`Inativar ${client.name}?`)) return;
    setInactivatingId(client.id);
    setError("");
    setNotice("");
    try {
      const { data: saved, error: saveError } = await supabase
        .from("clients")
        .update({ active: false, status: "inativa" })
        .eq("id", client.id)
        .select("id")
        .maybeSingle();
      if (saveError || !saved)
        throw new Error("Não foi possível inativar o cliente. Tente novamente.");
      await recordActivity(
        "cliente_inativado",
        client.id,
        "client",
        client.id,
        client.name,
        { active: client.active, status: client.status },
        { active: false, status: "inativa" },
      );
      setNotice("Cliente inativado com sucesso.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível inativar o cliente.");
    } finally {
      setInactivatingId(null);
    }
  };

  return (
    <section className="clients-page space-y-6">
      <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Administração
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {master ? "Empresas" : "Clientes"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie empresas, contatos e condições de acesso.
          </p>
        </div>
        <Button ref={newButton} className="dashboard-primary h-11" onClick={startNew}>
          <Plus />
          Novo cliente
        </Button>
      </header>
      <div className="clients-toolbar rounded-2xl border bg-card p-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Pesquisar clientes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, CNPJ, cidade ou estado"
            className="pl-10"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
          {(["all", "ativa", "inativa", "suspensa"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className="clients-filter"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all"
                ? "Todos"
                : status === "ativa"
                  ? "Ativos"
                  : status === "inativa"
                    ? "Inativos"
                    : "Suspensos"}
              <span>{listing.loading || listing.error ? "—" : counts[status]}</span>
            </button>
          ))}
          {master && (
            <button
              type="button"
              className="clients-filter"
              aria-pressed={statusFilter === "sem_responsavel"}
              onClick={() => setStatusFilter("sem_responsavel")}
            >
              Sem nutricionista
            </button>
          )}
        </div>
      </div>
      {notice && (
        <div role="status" className="clients-notice flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && !open && (
        <p role="alert" className="clients-error">
          {error}
        </p>
      )}
      <div className="grid gap-4">
        {listing.loading || listing.error ? (
          <PageLoading error={listing.error} retry={listing.reload} />
        ) : !filtered.length ? (
          <div className="rounded-2xl border bg-card px-5 py-10 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">
              {hasFilters ? "Nenhum cliente encontrado" : "Seu primeiro cliente começa aqui"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {hasFilters
                ? "Tente outro termo ou ajuste o filtro de situação."
                : "Cadastre uma empresa para organizar sua operação."}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={
                hasFilters
                  ? () => {
                      setSearch("");
                      setStatusFilter("all");
                    }
                  : startNew
              }
            >
              {hasFilters ? "Limpar filtros" : "Cadastrar primeiro cliente"}
            </Button>
          </div>
        ) : (
          filtered.map((client) => (
            <article key={client.id} className="client-card rounded-2xl border bg-card p-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-base font-semibold">{client.name}</h2>
                    <span className={`client-status client-status-${statusOf(client)}`}>
                      {STATUS_LABEL[statusOf(client)]}
                    </span>
                  </div>
                  {client.legal_name && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {client.legal_name}
                    </p>
                  )}
                </div>
                <span className="client-plan">{PLAN_LABEL[client.plan] ?? client.plan}</span>
              </div>
              <div className="client-metadata mt-5 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                <p className="flex items-start gap-2">
                  <MapPin className="size-4 shrink-0" />
                  <span>
                    {[client.city, client.state].filter(Boolean).join(" · ") ||
                      "Localização não informada"}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-foreground">CNPJ</span>{" "}
                  {client.cnpj || "Não informado"}
                </p>
                {client.responsible_name && (
                  <p className="flex items-start gap-2">
                    <UserRound className="size-4 shrink-0" />
                    <span>{client.responsible_name}</span>
                  </p>
                )}
                {client.email && (
                  <p className="flex items-start gap-2">
                    <Mail className="size-4 shrink-0" />
                    <span>{client.email}</span>
                  </p>
                )}
                {client.phone && (
                  <p className="flex items-start gap-2">
                    <Phone className="size-4 shrink-0" />
                    <span>{client.phone}</span>
                  </p>
                )}
              </div>
              {master && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Nutricionista: {client.nutritionists?.join(", ") || "Sem responsável vinculado"}
                </p>
              )}
              {client.public_code && (
                <ClientQrCard clientName={client.name} publicCode={client.public_code} />
              )}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                {onInspect && (
                  <Button variant="outline" onClick={() => onInspect(client as Company)}>
                    Ficha da empresa
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => startEdit(client)}
                  aria-label={`Editar ${client.name}`}
                >
                  <Pencil />
                  Editar cliente
                </Button>
                {statusOf(client) !== "inativa" && (
                  <Button
                    variant="ghost"
                    className="min-h-11 text-muted-foreground"
                    disabled={Boolean(inactivatingId)}
                    onClick={() => void inactivate(client)}
                    aria-label={`Inativar ${client.name}`}
                  >
                    {inactivatingId === client.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Power />
                    )}
                    {inactivatingId === client.id ? "Inativando…" : "Inativar"}
                  </Button>
                )}
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
          label="clientes"
        />
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!saving) {
            setOpen(value);
            if (!value) setError("");
          }
        }}
      >
        <DialogContent
          className="client-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0"
          overlayClassName="bg-black/35 backdrop-blur-[2px]"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;
            if (target?.isConnected) target.focus();
            else newButton.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left sm:px-6">
            <DialogTitle className="text-xl">
              {editingId ? "Editar cliente" : "Novo cliente"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-xs leading-relaxed">
              {editingId
                ? "Atualize os dados da empresa e salve as alterações."
                : "Preencha os dados da empresa. Campos com * são obrigatórios."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <fieldset disabled={saving} className="min-w-0 px-5 py-5 sm:px-6">
                <FormSection title="Identificação" description="Dados da empresa e localização.">
                  <FormField label="Nome do cliente *">
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </FormField>
                  <FormField label="Razão social">
                    <input
                      maxLength={200}
                      value={form.legal_name}
                      onChange={(event) => update("legal_name", event.target.value)}
                      placeholder="Opcional"
                    />
                  </FormField>
                  <FormField label="CNPJ">
                    <input
                      maxLength={20}
                      value={form.cnpj}
                      onChange={(event) => update("cnpj", event.target.value)}
                      placeholder="Opcional"
                    />
                  </FormField>
                  <FormField label="Cidade *">
                    <input
                      required
                      maxLength={100}
                      value={form.city}
                      onChange={(event) => update("city", event.target.value)}
                    />
                  </FormField>
                  <FormField label="Estado *">
                    <select
                      required
                      value={form.state}
                      onChange={(event) => update("state", event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Endereço">
                    <input
                      maxLength={200}
                      value={form.address}
                      onChange={(event) => update("address", event.target.value)}
                      placeholder="Rua, número e bairro"
                    />
                  </FormField>
                </FormSection>
                <FormSection title="Contato" description="Quem responde pela empresa.">
                  <FormField label="Responsável">
                    <input
                      maxLength={120}
                      value={form.responsible_name}
                      onChange={(event) => update("responsible_name", event.target.value)}
                    />
                  </FormField>
                  <FormField label="E-mail">
                    <input
                      type="email"
                      maxLength={160}
                      value={form.email}
                      onChange={(event) => update("email", event.target.value)}
                      placeholder="contato@empresa.com.br"
                    />
                  </FormField>
                  <FormField label="Telefone">
                    <input
                      type="tel"
                      maxLength={30}
                      value={form.phone}
                      onChange={(event) => update("phone", event.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </FormField>
                </FormSection>
                <FormSection title="Gestão" description="Plano e situação do cadastro.">
                  <FormField label="Plano">
                    <select
                      value={form.plan}
                      onChange={(event) => update("plan", event.target.value)}
                    >
                      {Object.entries(PLAN_LABEL).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                      {!(form.plan in PLAN_LABEL) && <option value={form.plan}>{form.plan}</option>}
                    </select>
                  </FormField>
                  <FormField label="Situação">
                    <select
                      value={form.status}
                      onChange={(event) => update("status", event.target.value as Status)}
                    >
                      <option value="ativa">Ativo</option>
                      <option value="inativa">Inativo</option>
                      <option value="suspensa">Suspenso</option>
                    </select>
                  </FormField>
                </FormSection>
              </fieldset>
            </div>
            <div className="client-dialog-footer shrink-0 border-t px-5 py-4 sm:px-6">
              {error && (
                <p role="alert" className="clients-error mb-3">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                >
                  <X />
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="dashboard-primary">
                  {saving ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Salvando…
                    </>
                  ) : editingId ? (
                    "Salvar alterações"
                  ) : (
                    "Cadastrar cliente"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="client-form-section">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
