import { SystemSelect } from "@/components/ui/system-select";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Package,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EVENT_NAMES,
  EXPIRY_WINDOW_NAMES,
  expiryOf,
  expiryWindow,
  productCount,
  remainingTime,
  type ExpiryWindow,
  type OperationalLabel,
  type RecentAction,
} from "@/lib/dashboard";
import type { useOperationalOverview } from "@/hooks/use-operational-overview";

type Props = {
  overview: ReturnType<typeof useOperationalOverview>;
  clients: { id: string; name: string }[];
  userName: string;
  clientId: string;
  onClientChange: (id: string) => void;
  onNavigate: (tab: "emit" | "products" | "team" | "history") => void;
  onWindow: (window: ExpiryWindow) => void;
  onLabel: (id: string) => void;
  onAction: (event: RecentAction) => void;
  canViewHistory: boolean;
  /** Sem permissão de emissão (ex.: nutricionista), o atalho de emitir não aparece. */
  canEmit?: boolean;
};

export function OperationalDashboard({
  overview,
  clients,
  userName,
  clientId,
  onClientChange,
  onNavigate,
  onWindow,
  onLabel,
  onAction,
  canViewHistory,
  canEmit = true,
}: Props) {
  const [listWindow, setListWindow] = useState<ExpiryWindow>("all");
  const { labels, actions, loading, labelsError, actionsError, now, updatedAt, reload } = overview;
  const visible = labels.filter((label) => !clientId || label.client_id === clientId);
  const expired = visible.filter((label) => expiryWindow(label, now) === "expired");
  const invalid = visible.filter((label) => expiryWindow(label, now) === null);
  const upcoming = visible
    .filter((label) => {
      const window = expiryWindow(label, now);
      return window !== null && (listWindow === "all" ? window !== "all" : window === listWindow);
    })
    .sort((a, b) => expiryOf(a).getTime() - expiryOf(b).getTime());
  const recent = actions.filter((action) => !clientId || action.client_id === clientId).slice(0, 8);
  const selectedClient = clients.find((client) => client.id === clientId);
  const windows = ["today", "three", "seven"] as const;

  return (
    <section className="operational-dashboard space-y-6" aria-label="Panorama da operação">
      <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Olá{userName ? `, ${userName.split(" ")[0]}` : ""}.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Veja o que precisa de atenção e acompanhe sua equipe.
          </p>
        </div>
        {canEmit && (
          <Button
            className="dashboard-primary h-11 rounded-xl shadow-none"
            onClick={() => onNavigate("emit")}
          >
            <Printer /> Emitir etiquetas
          </Button>
        )}
      </header>

      <div className="dashboard-context flex flex-col items-stretch gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {clients.length > 1 ? (
          <label className="flex min-w-0 flex-1 items-center gap-3 text-xs font-semibold sm:max-w-sm">
            Empresa
            <SystemSelect
              aria-label="Empresa"
              className="!min-w-0 !rounded-lg !py-2 text-sm"
              value={clientId}
              onChange={(event) => onClientChange(event.target.value)}
            >
              <option value="">Todas as empresas</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </SystemSelect>
          </label>
        ) : (
          <p className="text-sm font-semibold">
            {selectedClient?.name ?? clients[0]?.name ?? "Sua operação"}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span role="status" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`dashboard-status-dot ${loading ? "is-loading" : labelsError || actionsError ? "is-error" : ""}`}
            />
            {loading
              ? "Consultando dados…"
              : labelsError
                ? "Falha na atualização"
                : actionsError
                  ? "Atualização parcial"
                  : updatedAt
                    ? `Atualizado às ${format(updatedAt, "HH:mm")}`
                    : "Atualização pendente"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={loading}
            aria-label="Atualizar panorama"
            onClick={reload}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {labelsError ? (
        <div
          role="alert"
          className="dashboard-error rounded-xl border border-destructive/25 bg-card p-5 text-sm"
        >
          <p className="mb-1 font-semibold">Não foi possível atualizar as validades</p>
          <p>{labelsError}</p>
          <Button className="mt-3" variant="outline" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {!loading && expired.length > 0 && (
            <div role="alert">
              <button
                type="button"
                onClick={() => onWindow("expired")}
                className="dashboard-expired flex w-full items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AlertTriangle className="size-5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-destructive">
                    {expired.length} etiqueta{expired.length === 1 ? " já venceu" : "s já venceram"}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    Confira os produtos e registre o destino de cada um.
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-destructive" />
              </button>
            </div>
          )}
          <div className="dashboard-section-label">
            <h2>Controle de validades</h2>
            <span>Próximos 7 dias</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3" aria-busy={loading}>
            {windows.map((window, index) => {
              const items = visible.filter((label) => expiryWindow(label, now) === window);
              return (
                <button
                  key={window}
                  type="button"
                  disabled={loading}
                  onClick={() => onWindow(window)}
                  className={`dashboard-metric ${index === 0 ? "dashboard-metric-today" : ""} group min-w-0 rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`grid size-9 place-items-center rounded-xl ${index === 0 ? "bg-orange-50 text-orange-700" : index === 1 ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      <CalendarClock className="size-4" />
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">{EXPIRY_WINDOW_NAMES[window]}</p>
                  <p className="dashboard-metric-value mt-2 text-4xl font-semibold tracking-tight">
                    {loading ? (
                      <span
                        className="dashboard-skeleton inline-block h-10 w-12 rounded-md"
                        aria-hidden="true"
                      />
                    ) : (
                      productCount(items)
                    )}
                    <span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">
                      produto{productCount(items) === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {loading
                      ? "Consultando validades…"
                      : `${items.length} etiqueta${items.length === 1 ? "" : "s"} para acompanhar`}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="dashboard-count-note flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
            Etiquetas ativas com impressão confirmada, agrupadas por produto.
          </p>
          {invalid.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {invalid.length} etiqueta(s) sem validade válida. Confira os registros no histórico.
            </p>
          )}
        </>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="dashboard-panel min-w-0 rounded-2xl border bg-card">
          <div className="dashboard-panel-heading border-b p-5">
            <h2 className="font-display text-lg font-semibold">Prioridades de validade</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Vencidos e vencimentos dos próximos 7 dias, por ordem de urgência.
            </p>
            <label className="mt-4 block">
              <span className="sr-only">Período das prioridades</span>
              <SystemSelect
                className="!rounded-lg !py-2 text-xs"
                value={listWindow}
                onChange={(event) => setListWindow(event.target.value as ExpiryWindow)}
              >
                <option value="all">Todas as prioridades</option>
                {(["expired", ...windows] as const).map((window) => (
                  <option key={window} value={window}>
                    {EXPIRY_WINDOW_NAMES[window]}
                  </option>
                ))}
              </SystemSelect>
            </label>
          </div>
          {loading ? (
            <LoadingRows text="Consultando as validades…" />
          ) : labelsError ? (
            <p className="p-6 text-sm text-muted-foreground">
              As prioridades estarão disponíveis quando a consulta for concluída.
            </p>
          ) : upcoming.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto size-7 text-primary" />
              <p className="mt-3 text-sm font-semibold">Nenhuma pendência neste período</p>
              <p className="mt-1 text-xs text-muted-foreground">
                As próximas etiquetas aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {upcoming.slice(0, 6).map((label) => (
                <button
                  type="button"
                  key={label.id}
                  onClick={() => onLabel(label.id)}
                  className="dashboard-row flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span
                    className={`mt-1 grid size-8 shrink-0 place-items-center rounded-lg ${expiryWindow(label, now) === "expired" ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary"}`}
                  >
                    <Package className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block break-words text-sm">{label.product_name}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {label.lot_number ? `Lote ${label.lot_number} · ` : ""}
                      {label.storage_condition ?? "Conservação não informada"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {label.client_name} · Resp.: {label.responsible_name}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                      {format(expiryOf(label), "dd/MM 'às' HH:mm")}{" "}
                      <span
                        className={
                          expiryWindow(label, now) === "expired"
                            ? "dashboard-badge dashboard-badge-expired"
                            : expiryWindow(label, now) === "today"
                              ? "dashboard-badge dashboard-badge-today"
                              : "dashboard-badge"
                        }
                      >
                        {remainingTime(label, now)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          <div className="border-t p-3">
            <Button
              variant="ghost"
              className="w-full text-primary"
              onClick={() => onWindow(listWindow)}
            >
              Ver todas as validades <ArrowRight />
            </Button>
          </div>
        </section>

        <section className="dashboard-panel min-w-0 rounded-2xl border bg-card">
          <div className="dashboard-panel-heading border-b p-5">
            <h2 className="font-display text-lg font-semibold">Últimas ações</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Registros da equipe. Toque para ver os detalhes de cada ação.
            </p>
          </div>
          {loading ? (
            <LoadingRows text="Consultando as ações…" />
          ) : actionsError ? (
            <div role="alert" className="p-6 text-sm">
              <p className="font-semibold">Não foi possível consultar as ações</p>
              <p className="mt-2 text-muted-foreground">{actionsError}</p>
              <Button variant="outline" className="mt-4" onClick={reload}>
                Tentar novamente
              </Button>
            </div>
          ) : !recent.length ? (
            <div className="p-8 text-center">
              <History className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">Nenhuma ação registrada ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Confirmações, reimpressões e baixas aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recent.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  onClick={() => onAction(action)}
                  className="dashboard-row flex w-full gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span
                    className={`mt-1 grid size-8 shrink-0 place-items-center rounded-lg ${action.event_type === "falha_impressao" ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary"}`}
                  >
                    {action.event_type === "falha_impressao" ? (
                      <AlertTriangle className="size-4" />
                    ) : (
                      <History className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-relaxed">
                      <strong>{action.user_name ?? "Usuário não identificado"}</strong>{" "}
                      {EVENT_NAMES[action.event_type] ?? "registrou uma ação"}
                      {action.label ? (
                        <>
                          {" "}
                          de <strong>{action.label.product_name}</strong>
                        </>
                      ) : action.entity_name ? (
                        <>
                          {" "}
                          <strong>{action.entity_name}</strong>
                        </>
                      ) : action.source === "activity" ? (
                        ""
                      ) : (
                        " de uma etiqueta"
                      )}
                      .
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {action.label?.client_name ??
                        clients.find((client) => client.id === action.client_id)?.name ??
                        "Estabelecimento"}
                      {action.label?.lot_number ? ` · Lote ${action.label.lot_number}` : ""}
                    </span>
                    <time
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                      dateTime={action.created_at}
                    >
                      <Clock3 className="size-3" />
                      {format(new Date(action.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </time>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          {canViewHistory && (
            <div className="border-t p-3">
              <Button
                variant="ghost"
                className="w-full text-primary"
                onClick={() => onNavigate("history")}
              >
                Ver histórico de etiquetas <ArrowRight />
              </Button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function LoadingRows({ text }: { text: string }) {
  return (
    <div role="status" className="p-5">
      <span className="sr-only">{text}</span>
      <div aria-hidden="true" className="space-y-5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex gap-3">
            <div className="dashboard-skeleton size-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="dashboard-skeleton h-4 w-3/4 rounded" />
              <div className="dashboard-skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
