import { cloneElement, useId, useRef, useState, type ReactElement } from "react";
import { addDays, format, isValid } from "date-fns";
import {
  AlertTriangle,
  ArrowDown,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  Package,
  RefreshCw,
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
import {
  EXPIRY_WINDOW_NAMES,
  expiryOf,
  expiryWindow,
  remainingTime,
  type ExpiryWindow,
  type OperationalLabel,
} from "@/lib/dashboard";
import { categoryKey } from "@/lib/categories";

type Settlement = "utilizada" | "consumida" | "descartada";
type Props = {
  history: OperationalLabel[];
  alertDays: number;
  onAlertDaysChange: (days: number) => void;
  onSettle: (record: OperationalLabel, status: Settlement) => Promise<boolean>;
  window: ExpiryWindow;
  onWindowChange: (window: ExpiryWindow) => void;
  now: Date;
  clientName: string;
  onOpenLabel: (id: string) => void;
  onRefresh: () => void;
  updatedAt: Date | null;
  loading: boolean;
  loadError: string | null;
};
const SETTLEMENTS: { value: Settlement; name: string; description: string }[] = [
  { value: "utilizada", name: "Utilizada", description: "A etiqueta foi utilizada na operação." },
  { value: "consumida", name: "Consumida", description: "O produto foi consumido." },
  { value: "descartada", name: "Descartada", description: "O produto foi descartado." },
];
const dateText = (date: Date) =>
  isValid(date) ? format(date, "dd/MM/yyyy 'às' HH:mm") : "Data não informada";

export function ValidadesPanel({
  history,
  alertDays,
  onAlertDaysChange,
  onSettle,
  window,
  onWindowChange,
  now,
  clientName,
  onOpenLabel,
  onRefresh,
  updatedAt,
  loading,
  loadError,
}: Props) {
  const [clientQuery, setClientQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [lotQuery, setLotQuery] = useState("");
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<OperationalLabel | null>(null);
  const [status, setStatus] = useState<Settlement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const filterInput = useRef<HTMLInputElement | null>(null);
  const id = useId();
  const active = history.filter(
    (item) => item.print_status === "confirmada" && item.label_status === "ativa",
  );
  const invalid = active.filter((item) => !isValid(expiryOf(item)));
  const rows = active
    .filter(
      (item) =>
        isValid(expiryOf(item)) &&
        categoryKey(item.client_name).includes(categoryKey(clientQuery)) &&
        categoryKey(item.product_name).includes(categoryKey(productQuery)) &&
        categoryKey(item.lot_number ?? "").includes(categoryKey(lotQuery)) &&
        (window === "all" || expiryWindow(item, now) === window),
    )
    .sort((a, b) => expiryOf(a).getTime() - expiryOf(b).getTime());
  const today = format(now, "yyyy-MM-dd");
  const limit = addDays(now, alertDays);
  const groups = [
    {
      key: "expired",
      title: "Vencidas",
      description: "Verifique o destino destes produtos.",
      tone: "expired",
      icon: AlertTriangle,
      items: rows.filter((item) => expiryOf(item) <= now),
    },
    {
      key: "today",
      title: "Vencem hoje",
      description: "Priorize o uso durante a operação de hoje.",
      tone: "today",
      icon: CalendarClock,
      items: rows.filter(
        (item) => expiryOf(item) > now && format(expiryOf(item), "yyyy-MM-dd") === today,
      ),
    },
    {
      key: "soon",
      title: "Próximas de vencer",
      description: `Vencimentos após hoje, até ${alertDays} dia${alertDays === 1 ? "" : "s"} de antecedência.`,
      tone: "soon",
      icon: Clock3,
      items: rows.filter(
        (item) => format(expiryOf(item), "yyyy-MM-dd") > today && expiryOf(item) <= limit,
      ),
    },
    {
      key: "later",
      title: "Dentro do prazo",
      description: "Vencimentos após o período de aviso.",
      tone: "later",
      icon: CheckCircle2,
      items: rows.filter(
        (item) => format(expiryOf(item), "yyyy-MM-dd") > today && expiryOf(item) > limit,
      ),
    },
  ];
  const hasFilters = Boolean(clientQuery || productQuery || lotQuery || window !== "all");
  const clearFilters = () => {
    setClientQuery("");
    setProductQuery("");
    setLotQuery("");
    onWindowChange("all");
  };
  const beginSettlement = (item: OperationalLabel) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTarget(item);
    setStatus(null);
    setError("");
    setNotice("");
  };
  const settle = async () => {
    if (!target || !status || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      if (!(await onSettle(target, status))) {
        setError(
          "Não foi possível registrar a baixa. Seus dados foram mantidos; atualize a página e tente novamente.",
        );
        return;
      }
      setNotice(`Baixa registrada: etiqueta de ${target.product_name} marcada como ${status}.`);
      setTarget(null);
    } catch {
      setError("Não foi possível registrar a baixa. Tente novamente.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <section className="validities-page space-y-6">
      <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Controle de validades · PVPS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Validades</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Priorize o que vence primeiro e registre o destino das etiquetas.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading || saving}
          onClick={onRefresh}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {loading ? "Atualizando…" : "Atualizar"}
        </Button>
      </header>
      <div className="validities-context flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="flex min-w-0 items-center gap-2">
          <Building2 className="size-4 shrink-0" />
          <span>{clientName}</span>
        </p>
        <span>
          {loading
            ? "Consultando dados…"
            : loadError
              ? "Falha na atualização"
              : updatedAt
                ? `Atualizado às ${format(updatedAt, "HH:mm")}`
                : "Consulta concluída"}
        </span>
      </div>
      <div className="validities-filters rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Cliente">
            <input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Nome da empresa"
            />
          </FilterField>
          <FilterField label="Produto">
            <input
              ref={filterInput}
              type="search"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Nome do produto"
            />
          </FilterField>
          <FilterField label="Lote">
            <input
              value={lotQuery}
              onChange={(event) => setLotQuery(event.target.value)}
              placeholder="Número do lote"
            />
          </FilterField>
          <FilterField label="Período das validades">
            <select
              value={window}
              onChange={(event) => onWindowChange(event.target.value as ExpiryWindow)}
            >
              {Object.entries(EXPIRY_WINDOW_NAMES).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={`${id}-days`}>Avisar com antecedência de</label>
            <input
              id={`${id}-days`}
              className="validities-days"
              aria-label="Antecedência do aviso (dias)"
              type="number"
              min={1}
              max={90}
              value={alertDays}
              onChange={(event) => onAlertDaysChange(Number(event.target.value))}
            />
            <span>dias</span>
          </div>
          <Button
            variant="ghost"
            className="min-h-11 text-xs"
            disabled={!hasFilters}
            onClick={clearFilters}
          >
            <X />
            Limpar filtros
          </Button>
        </div>
      </div>
      {loadError && (
        <div role="alert" className="clients-error">
          <p className="font-semibold">Não foi possível consultar as validades</p>
          <p className="mt-2">{loadError}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={onRefresh}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!loadError && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Panorama deste filtro</h2>
            <p role="status" className="text-xs text-muted-foreground">
              {loading
                ? "Consultando etiquetas…"
                : `${rows.length} etiqueta${rows.length === 1 ? "" : "s"} para acompanhar`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={`validity-metric validity-${group.tone}`}
                disabled={loading || !group.items.length}
                aria-label={`Ver ${group.title.toLocaleLowerCase("pt-BR")}: ${group.items.length} etiquetas`}
                onClick={() =>
                  document.getElementById(`${id}-${group.key}`)?.scrollIntoView({
                    behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  })
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <group.icon className="size-4" />
                  <ArrowDown className="size-3.5 opacity-50" />
                </div>
                <p className="mt-3 text-xs font-medium">{group.title}</p>
                <strong className="mt-1 block text-3xl font-semibold tabular-nums">
                  {loading ? "—" : group.items.length}
                </strong>
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
            Somente etiquetas ativas com impressão confirmada. Contagens seguem os filtros acima.
          </p>
        </div>
      )}
      {notice && (
        <p role="status" className="clients-notice flex items-start gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          {notice}
        </p>
      )}
      {!loading && invalid.length > 0 && (
        <p role="alert" className="clients-error">
          {invalid.length} etiqueta{invalid.length === 1 ? "" : "s"} com validade inválida. Confira
          os registros no histórico antes de dar baixa.
        </p>
      )}
      {loadError ? null : loading ? (
        <div role="status" className="space-y-4 rounded-2xl border bg-card p-5">
          <span className="sr-only">Consultando as validades…</span>
          {[0, 1, 2].map((row) => (
            <div key={row} aria-hidden="true" className="space-y-2">
              <div className="dashboard-skeleton h-4 w-1/2 rounded" />
              <div className="dashboard-skeleton h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : !rows.length ? (
        <div className="rounded-2xl border bg-card px-5 py-10 text-center">
          <Search className="mx-auto size-7 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold">
            {hasFilters
              ? "Nenhuma etiqueta neste filtro"
              : "Nenhuma etiqueta ativa para acompanhar"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasFilters
              ? "Ajuste o período ou os termos de pesquisa."
              : "Etiquetas com impressão confirmada aparecerão aqui."}
          </p>
          {hasFilters && (
            <Button variant="outline" className="mt-5 min-h-11" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section
              key={group.key}
              id={`${id}-${group.key}`}
              className={`validity-group validity-${group.tone} overflow-hidden rounded-2xl border bg-card`}
            >
              <header className="flex items-start gap-3 border-b px-5 py-4">
                <span className="validity-group-icon grid size-9 shrink-0 place-items-center rounded-xl">
                  <group.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{group.title}</h2>
                    <span className="validity-group-count">{group.items.length}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {group.description}
                  </p>
                </div>
              </header>
              <div className="divide-y">
                {group.items.slice(0, visibleLimits[group.key] ?? 10).map((item) => (
                  <article
                    key={item.id}
                    className="validity-row grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="validity-product text-left text-sm font-semibold"
                          onClick={() => onOpenLabel(item.id)}
                        >
                          {item.product_name}
                        </button>
                        <span className={`validity-time validity-${group.tone}`}>
                          {remainingTime(item, now)}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {item.client_name}
                        {item.lot_number ? ` · Lote ${item.lot_number}` : " · Sem lote informado"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-2 text-xs">
                        <p className="flex items-center gap-1.5 font-medium">
                          <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
                          {dateText(expiryOf(item))}
                        </p>
                        <p className="text-muted-foreground">
                          Responsável: {item.responsible_name}
                        </p>
                        {item.storage_condition && (
                          <p className="text-muted-foreground">{item.storage_condition}</p>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Emitida em {dateText(new Date(item.issued_at))}
                        {(item.reprint_count ?? 0) > 0
                          ? ` · ${item.reprint_count} reimpressão(ões)`
                          : ""}
                      </p>
                    </div>
                    <div className="validity-actions flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        variant="ghost"
                        className="min-h-11 text-xs text-muted-foreground"
                        aria-label={`Detalhes de ${item.product_name}`}
                        onClick={() => onOpenLabel(item.id)}
                      >
                        <Eye />
                        Detalhes
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11 text-xs"
                        disabled={saving}
                        aria-label={`Registrar baixa de ${item.product_name}`}
                        onClick={() => beginSettlement(item)}
                      >
                        <Package />
                        Registrar baixa
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {group.items.length > (visibleLimits[group.key] ?? 10) && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Exibindo {visibleLimits[group.key] ?? 10} de {group.items.length} etiquetas
                  </p>
                  <Button
                    variant="ghost"
                    className="min-h-11 text-xs text-primary"
                    onClick={() =>
                      setVisibleLimits((previous) => ({
                        ...previous,
                        [group.key]: (previous[group.key] ?? 10) + 10,
                      }))
                    }
                  >
                    Mostrar mais etiquetas
                  </Button>
                </div>
              )}
            </section>
          ))
      )}
      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setTarget(null);
            setError("");
          }
        }}
      >
        <DialogContent
          className="client-dialog validity-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0"
          overlayClassName="bg-black/35 backdrop-blur-[2px]"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else filterInput.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left">
            <DialogTitle>Registrar baixa</DialogTitle>
            <DialogDescription className="mt-2 text-xs leading-relaxed">
              Escolha o destino desta etiqueta. A baixa retira o registro da lista de validades
              ativas.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {target && (
              <div className="mb-5 rounded-xl border bg-muted/30 p-4">
                <h3 className="break-words text-sm font-semibold">{target.product_name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {target.client_name}
                  {target.lot_number ? ` · Lote ${target.lot_number}` : ""}
                </p>
                <p className="mt-2 text-xs font-medium">Validade: {dateText(expiryOf(target))}</p>
              </div>
            )}
            <fieldset disabled={saving} className="space-y-2">
              <legend className="mb-3 text-xs font-medium">Destino da etiqueta</legend>
              {SETTLEMENTS.map((choice) => (
                <label
                  key={choice.value}
                  className={`validity-choice ${choice.value === "descartada" ? "validity-choice-discard" : ""}`}
                  data-selected={status === choice.value}
                >
                  <input
                    type="radio"
                    name={`${id}-settlement`}
                    value={choice.value}
                    checked={status === choice.value}
                    onChange={() => setStatus(choice.value)}
                  />
                  <span className="min-w-0">
                    <strong className="block text-sm font-medium">{choice.name}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {choice.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="clients-error mt-4">
                {error}
              </p>
            )}
          </div>
          <div className="client-dialog-footer shrink-0 border-t px-5 py-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" disabled={saving} onClick={() => setTarget(null)}>
                Cancelar
              </Button>
              <Button
                className="dashboard-primary"
                disabled={!status || saving}
                onClick={() => void settle()}
              >
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Registrando…
                  </>
                ) : (
                  "Confirmar baixa"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function FilterField({
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
