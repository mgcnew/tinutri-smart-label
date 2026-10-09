import { SystemSelect } from "@/components/ui/system-select";
import {
  cloneElement,
  useCallback,
  useId,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  Search,
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
import { ProductImportDialog } from "@/components/ProductImportDialog";
import { CategoryInput } from "@/components/CategoryInput";
import { categoryKey } from "@/lib/categories";
import { supabase } from "@/integrations/supabase/client";
import { useFocusedEntity } from "@/hooks/use-focused-entity";
import { STORAGE_PRESETS } from "@/lib/label";
import { ALLERGENS, allergenText, normalizeAllergens } from "@/lib/allergens";
import { MAX_SHELF_DAYS, normalizeShelfByStorage } from "@/lib/shelf-life";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { scopeKey, scopeIds, searchColumns, searchPattern } from "@/lib/list-query";

type Product = {
  company?: { name: string } | null;
  id: string;
  client_id: string;
  name: string;
  category: string;
  shelf_life_days: number;
  requires_lot: boolean;
  requires_inspection: boolean;
  inspection_type: "SIF" | "SISP" | "SIM" | null;
  inspection_number: string | null;
  notes: string | null;
  active: boolean;
  shelf_life_by_storage?: unknown;
  allergens?: string[] | null;
};
type Props = {
  clients: { id: string; name: string; active: boolean }[];
  scope: string[] | null;
  revision: number;
  refresh: () => Promise<void>;
  focusedId: string | null;
  initialClient?: string;
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
const EMPTY = {
  client_id: "",
  name: "",
  category: "",
  shelf_life_days: "3",
  requires_lot: false,
  requires_inspection: false,
  inspection_type: "SIF" as "SIF" | "SISP" | "SIM",
  inspection_number: "",
  notes: "",
  by_storage: {} as Record<string, string>,
  allergens: [] as string[],
};

export function ProductsPanel({
  clients,
  scope,
  revision,
  refresh,
  recordActivity,
  focusedId,
  initialClient = "",
}: Props) {
  const [form, setForm] = useState(EMPTY);
  const [editingRecord, setEditingRecord] = useState<Product | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(initialClient);
  useEffect(() => setClientFilter(initialClient), [initialClient]);
  const [saving, setSaving] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const newButton = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const activeClients = clients.filter((client) => client.active);
  const term = useDebouncedValue(search.trim());
  const accessKey = scopeKey(scope);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const ids = scopeIds(accessKey);
      if (ids?.length === 0) return { rows: [], total: 0 };
      let query = supabase
        .from("products")
        .select("*,company:clients(name)", { count: "exact" })
        .eq("active", true)
        .order("name")
        .order("id")
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (ids) query = query.in("client_id", ids);
      if (clientFilter) query = query.eq("client_id", clientFilter);
      if (term) query = query.or(searchColumns(["name", "category"], term));
      const { data, count, error } = await query;
      if (error || count === null) throw error ?? new Error("Contagem indisponível");
      return {
        rows: (data ?? []) as (Product & { company?: { name: string } | null })[],
        total: count,
      };
    },
    [accessKey, term, clientFilter],
  );
  const listing = usePaginatedQuery(
    JSON.stringify([accessKey, term, clientFilter]),
    load,
    revision,
  );
  const filtered = listing.rows;
  const hasFilters = Boolean(search.trim() || clientFilter);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const categoryTerm = useDebouncedValue(form.category.trim());
  useEffect(() => {
    if (!open || !form.client_id) {
      setCategories([]);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setCategoriesError(false);
    setCategories([]);
    let query = supabase
      .from("products")
      .select("category")
      .eq("client_id", form.client_id)
      .eq("active", true)
      .order("category")
      .limit(50)
      .abortSignal(controller.signal);
    if (categoryTerm) query = query.filter("category", "imatch", searchPattern(categoryTerm));
    void query.then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setCategoriesError(true);
        return;
      }
      const names = new Map<string, string>();
      (data ?? []).forEach((product) => {
        const name = product.category.trim();
        if (name && !names.has(categoryKey(name))) names.set(categoryKey(name), name);
      });
      setCategories([...names.values()]);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, form.client_id, categoryTerm, revision]);
  const update = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const startNew = () => {
    returnFocus.current = newButton.current;
    setForm({
      ...EMPTY,
      client_id: activeClients.some((client) => client.id === clientFilter)
        ? clientFilter
        : activeClients.length === 1
          ? activeClients[0].id
          : "",
    });
    setEditingId(null);
    setEditingRecord(null);
    setError("");
    setNotice("");
    setOpen(true);
  };
  const startEdit = useCallback((product: Product) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm({
      client_id: product.client_id,
      name: product.name,
      category: product.category,
      shelf_life_days: String(product.shelf_life_days),
      requires_lot: product.requires_lot,
      requires_inspection: product.requires_inspection,
      inspection_type: product.inspection_type ?? "SIF",
      inspection_number: product.inspection_number ?? "",
      notes: product.notes ?? "",
      allergens: normalizeAllergens(product.allergens),
      by_storage: Object.fromEntries(
        Object.entries(normalizeShelfByStorage(product.shelf_life_by_storage)).map(([key, value]) => [key, String(value)]),
      ),
    });
    setEditingId(product.id);
    setEditingRecord(product);
    setError("");
    setNotice("");
    setOpen(true);
  }, []);
  useFocusedEntity("products", focusedId, scope, startEdit, setError);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    const days = Number(form.shelf_life_days);
    if (
      !form.client_id ||
      form.name.trim().length < 2 ||
      form.category.trim().length < 2 ||
      !form.shelf_life_days.trim() ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > 3650 ||
      (form.requires_inspection && !form.inspection_number.trim())
    ) {
      setError("Confira empresa, produto, categoria, validade e dados de inspeção.");
      return;
    }
    const byStorage: Record<string, number> = {};
    for (const preset of STORAGE_PRESETS) {
      const raw = (form.by_storage[preset] ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > MAX_SHELF_DAYS) {
        setError(`Validade por conservação inválida em “${preset}”. Use de 0 a ${MAX_SHELF_DAYS} dias ou deixe em branco.`);
        return;
      }
      byStorage[preset] = value;
    }
    setSaving(true);
    const category =
      categories.find((name) => categoryKey(name) === categoryKey(form.category)) ??
      form.category.trim();
    const payload = {
      client_id: form.client_id,
      name: form.name.trim(),
      category,
      shelf_life_days: days,
      requires_lot: form.requires_lot,
      requires_inspection: form.requires_inspection,
      inspection_type: form.requires_inspection ? form.inspection_type : null,
      inspection_number: form.requires_inspection ? form.inspection_number.trim() : null,
      notes: form.notes.trim() || null,
      shelf_life_by_storage: byStorage,
      allergens: normalizeAllergens(form.allergens),
    };
    try {
      const { data: saved, error: saveError } = editingId
        ? await supabase
            .from("products")
            .update(payload)
            .eq("id", editingId)
            .select("id")
            .maybeSingle()
        : await supabase.from("products").insert(payload).select("id").single();
      if (saveError || !saved)
        throw new Error(
          "Não foi possível salvar o produto. Seus dados foram mantidos para tentar novamente.",
        );
      await recordActivity(
        editingId ? "produto_atualizado" : "produto_criado",
        payload.client_id,
        "product",
        saved.id,
        payload.name,
        editingId ? { ...editingRecord } : {},
        payload,
      );
      setOpen(false);
      setNotice(
        editingId ? "Alterações do produto salvas com sucesso." : "Produto cadastrado com sucesso.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  };
  const inactivate = async (product: Product) => {
    if (inactivatingId || !confirm(`Inativar ${product.name}?`)) return;
    setInactivatingId(product.id);
    setError("");
    setNotice("");
    try {
      const { data: saved, error: saveError } = await supabase
        .from("products")
        .update({ active: false })
        .eq("id", product.id)
        .select("id")
        .maybeSingle();
      if (saveError || !saved) throw new Error("Não foi possível inativar o produto.");
      await recordActivity(
        "produto_inativado",
        product.client_id,
        "product",
        product.id,
        product.name,
        { active: product.active },
        { active: false },
      );
      setNotice("Produto inativado com sucesso.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível inativar o produto.");
    } finally {
      setInactivatingId(null);
    }
  };
  return (
    <section className="products-page clients-page space-y-6">
      <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Catálogo por empresa
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Produtos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organize os produtos e as regras aplicadas às etiquetas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProductImportDialog
            clients={activeClients.filter((client) => scope === null || scope.includes(client.id))}
            initialClient={clientFilter}
            refresh={refresh}
            recordActivity={recordActivity}
            onSuccess={setNotice}
          />
          <Button ref={newButton} className="dashboard-primary h-11" onClick={startNew}>
            <Plus />
            Cadastrar produto
          </Button>
        </div>
      </header>
      <div className="clients-toolbar grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            aria-label="Pesquisar produtos"
            className="pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar produto ou categoria"
          />
        </div>
        <SystemSelect
          aria-label="Filtrar produtos por empresa"
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
        >
          <option value="">Todas as empresas</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </SystemSelect>
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
            <PackagePlus className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">
              {hasFilters ? "Nenhum produto encontrado" : "Comece seu catálogo de produtos"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {hasFilters
                ? "Ajuste a pesquisa ou a empresa selecionada."
                : "Cadastre os produtos e defina suas validades padrão."}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={
                hasFilters
                  ? () => {
                      setSearch("");
                      setClientFilter("");
                    }
                  : startNew
              }
            >
              {hasFilters ? "Limpar filtros" : "Cadastrar primeiro produto"}
            </Button>
          </div>
        ) : (
          filtered.map((product) => (
            <article key={product.id} className="client-card rounded-2xl border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <PackagePlus className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-semibold">{product.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.company?.name ??
                      clients.find((client) => client.id === product.client_id)?.name ??
                      "Empresa não encontrada"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="product-category">{product.category}</span>
                <span className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2">
                  <Clock3 className="size-3.5" />
                  {product.shelf_life_days === 0
                    ? "Uso no mesmo dia"
                    : `Validade padrão: ${product.shelf_life_days} dia${product.shelf_life_days === 1 ? "" : "s"}`}
                </span>
                {product.requires_lot && (
                  <span className="rounded-lg border px-3 py-2 text-muted-foreground">
                    Exige lote
                  </span>
                )}
                {product.requires_inspection && (
                  <span className="rounded-lg border px-3 py-2 text-muted-foreground">
                    {product.inspection_type} {product.inspection_number}
                  </span>
                )}
                {allergenText(product.allergens) && (
                  <span className="rounded-lg border px-3 py-2 text-muted-foreground">
                    Alérgenos: {allergenText(product.allergens)}
                  </span>
                )}
              </div>
              {product.notes && (
                <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                  {product.notes}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  className="min-h-11"
                  aria-label={`Editar ${product.name}`}
                  onClick={() => startEdit(product)}
                >
                  <Pencil />
                  Editar produto
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11 text-muted-foreground"
                  aria-label={`Inativar ${product.name}`}
                  disabled={Boolean(inactivatingId)}
                  onClick={() => void inactivate(product)}
                >
                  {inactivatingId === product.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Power />
                  )}
                  {inactivatingId === product.id ? "Inativando…" : "Inativar"}
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
          label="produtos"
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
          className="client-dialog product-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0"
          overlayClassName="bg-black/35"
          onEscapeKeyDown={(event) => {
            if (
              saving ||
              (event.target instanceof HTMLElement &&
                event.target.getAttribute("role") === "combobox" &&
                event.target.getAttribute("aria-expanded") === "true")
            )
              event.preventDefault();
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
              {editingId ? "Editar produto" : "Cadastrar produto"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-xs leading-relaxed">
              Defina os dados e as regras de validade. Campos com * são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 thin-scroll overflow-y-auto">
              <fieldset disabled={saving} className="min-w-0 px-5 py-5 sm:px-6">
                <FormSection title="Identificação" description="Produto, empresa e categoria.">
                  <FormField label="Empresa *">
                    <SystemSelect
                      required
                      value={form.client_id}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          client_id: event.target.value,
                          category: "",
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {form.client_id &&
                        !clients.some((client) => client.id === form.client_id) && (
                          <option value={form.client_id}>
                            {editingRecord?.company?.name ?? "Empresa do produto"}
                          </option>
                        )}
                      {clients
                        .filter(
                          (client) => client.active || (editingId && client.id === form.client_id),
                        )
                        .map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                            {!client.active ? " (inativa)" : ""}
                          </option>
                        ))}
                    </SystemSelect>
                  </FormField>
                  <FormField label="Produto *">
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </FormField>
                  <CategoryInput
                    key={form.client_id}
                    value={form.category}
                    onChange={(value) => update("category", value)}
                    options={categories}
                    disabled={!form.client_id || saving}
                  />
                  {categoriesError && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Sugestões indisponíveis. Você pode digitar a categoria.
                    </p>
                  )}
                  <FormField label="Validade padrão (dias) *">
                    <input
                      required
                      type="number"
                      min={0}
                      max={3650}
                      step={1}
                      value={form.shelf_life_days}
                      onChange={(event) => update("shelf_life_days", event.target.value)}
                    />
                  </FormField>
                </FormSection>
                <FormSection
                  title="Rastreabilidade"
                  description="Informações obrigatórias para a emissão."
                >
                  <label className="product-check flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.requires_lot}
                      onChange={(event) => update("requires_lot", event.target.checked)}
                    />
                    Exigir número de lote
                  </label>
                  <label className="product-check flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.requires_inspection}
                      onChange={(event) => update("requires_inspection", event.target.checked)}
                    />
                    Exigir SIF, SISP ou SIM
                  </label>
                  {form.requires_inspection && (
                    <>
                      <FormField label="Tipo de inspeção *">
                        <SystemSelect
                          value={form.inspection_type}
                          onChange={(event) =>
                            update(
                              "inspection_type",
                              event.target.value as typeof form.inspection_type,
                            )
                          }
                        >
                          <option value="SIF">SIF</option>
                          <option value="SISP">SISP</option>
                          <option value="SIM">SIM</option>
                        </SystemSelect>
                      </FormField>
                      <FormField label="Número de inspeção *">
                        <input
                          required
                          maxLength={40}
                          value={form.inspection_number}
                          onChange={(event) => update("inspection_number", event.target.value)}
                        />
                      </FormField>
                    </>
                  )}
                </FormSection>
                <fieldset className="client-form-section rounded-xl border p-3">
                  <legend className="px-1 text-sm font-semibold">Alérgenos (impressos na etiqueta)</legend>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {ALLERGENS.map((allergen) => (
                      <label key={allergen.code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.allergens.includes(allergen.code)}
                          onChange={(event) =>
                            update(
                              "allergens",
                              event.target.checked
                                ? [...form.allergens, allergen.code]
                                : form.allergens.filter((code) => code !== allergen.code),
                            )
                          }
                        />
                        {allergen.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details className="client-form-section rounded-xl border p-3" open={Object.keys(form.by_storage).length > 0}>
                  <summary className="cursor-pointer text-sm font-semibold">Validade por conservação (opcional)</summary>
                  <p className="mt-2 text-xs text-muted-foreground">Quando a conservação escolhida na emissão tiver prazo aqui, ele substitui a validade padrão. Em branco, vale a validade padrão.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {STORAGE_PRESETS.map((preset) => (
                      <FormField key={preset} label={preset}>
                        <input
                          type="number"
                          min={0}
                          max={MAX_SHELF_DAYS}
                          inputMode="numeric"
                          placeholder="Padrão"
                          value={form.by_storage[preset] ?? ""}
                          onChange={(event) => update("by_storage", { ...form.by_storage, [preset]: event.target.value })}
                        />
                      </FormField>
                    ))}
                  </div>
                </details>
                <div className="client-form-section">
                  <FormField label="Observações">
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={form.notes}
                      onChange={(event) => update("notes", event.target.value)}
                      placeholder="Informações adicionais do produto"
                    />
                  </FormField>
                </div>
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
                    "Salvar produto"
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
