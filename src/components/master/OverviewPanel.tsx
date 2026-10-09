import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useState } from "react";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  Users,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { management, errorMessage, summaryArgs, type Summary } from "@/lib/management";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PageLoading } from "@/components/PaginationControls";
import { Heading } from "./Shared";
import { RecentActivities } from "./RecentActivities";
import type { RecentAction } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
export function OverviewPanel({
  revision,
  onCompanies,
  onCare,
  onUsers,
  onReport,
  onExpiry,
  onAction,
}: {
  revision: number;
  onAction: (action: RecentAction) => void;
  onCompanies: (filter: "all" | "ativa" | "sem_responsavel" | "suspensa") => void;
  onCare: (filter: string) => void;
  onUsers: () => void;
  onReport: () => void;
  onExpiry: (window: "expired" | "today" | "three" | "seven") => void;
}) {
  const [days, setDays] = useState(30);
  const load = useCallback(
    async (_offset: number, _size: number, signal: AbortSignal) => {
      const { data, error } = await management
        .rpc("master_summary", summaryArgs(null, days))
        .abortSignal(signal);
      if (error) throw new Error(errorMessage(error));
      return { rows: [data as unknown as Summary], total: 1 };
    },
    [days],
  );
  const query = usePaginatedQuery(String(days), load, revision);
  const summary = query.rows[0];
  return (
    <section className="space-y-6">
      <Heading
        title="Visão geral"
        description="Priorize o que precisa de atenção nas empresas e no acompanhamento profissional."
        action={
          <div className="flex flex-wrap gap-2">
            <SystemSelect
              aria-label="Período dos indicadores"
              className="!w-auto"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </SystemSelect>
            <Button variant="outline" onClick={onReport}>
              Relatório
            </Button>
          </div>
        }
      />
      {query.loading || query.error ? (
        <PageLoading error={query.error} retry={query.reload} />
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Empresas ativas",
                  value: summary.active,
                  icon: Building2,
                  action: () => onCompanies("ativa"),
                },
                {
                  label: "Sem nutricionista",
                  value: summary.unassigned,
                  icon: Users,
                  action: () => onCompanies("sem_responsavel"),
                },
                {
                  label: "Registros em aberto",
                  value: summary.open,
                  icon: ClipboardList,
                  action: () => onCare("abertas"),
                },
                {
                  label: "Prazos atrasados",
                  value: summary.overdue,
                  icon: AlertTriangle,
                  action: () => onCare("atrasadas"),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  className="master-metric rounded-2xl border bg-card p-5 text-left"
                  onClick={item.action}
                >
                  <item.icon className="size-5 text-primary" />
                  <strong className="mt-4 block text-3xl font-semibold tabular-nums">
                    {item.value.toLocaleString("pt-BR")}
                  </strong>
                  <span className="mt-2 block text-xs text-muted-foreground">{item.label}</span>
                </button>
              ))}
            </div>
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="font-semibold">Prioridades de validade</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Etiquetas ativas com impressão confirmada. Toque para abrir a lista correspondente.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  ["Vencidas", "expired", summary.expired],
                  ["Vencem hoje", "today", summary.today],
                  ["Próximos 3 dias", "three", summary.three],
                  ["De 4 a 7 dias", "seven", summary.seven],
                ].map(([name, value, total]) => (
                  <button
                    key={String(value)}
                    className={`master-priority rounded-xl border p-4 text-left ${value === "expired" ? "is-red" : value === "today" ? "is-orange" : ""}`}
                    onClick={() => onExpiry(value as "expired")}
                  >
                    <CalendarClock className="size-4" />
                    <strong className="mt-3 block text-2xl font-semibold">
                      {Number(total).toLocaleString("pt-BR")}
                    </strong>
                    <span className="mt-1 block text-xs">{String(name)}</span>
                  </button>
                ))}
              </div>
            </section>
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="font-semibold">Movimento do período</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registros de emissão e baixas por descarte nos últimos {days} dias.
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Etiquetas registradas</dt>
                    <dd className="mt-2 text-2xl font-semibold">{summary.issued}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Baixas por descarte</dt>
                    <dd className="mt-2 text-2xl font-semibold">{summary.discarded}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                  Emissões podem incluir impressões aguardando confirmação; confira o estado no
                  relatório.
                </p>
              </section>
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="font-semibold">Ações de gestão</h2>
                <div className="mt-4 grid gap-2">
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 justify-between whitespace-normal text-left"
                    onClick={() => onCompanies("sem_responsavel")}
                  >
                    Distribuir empresas sem responsável
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 justify-between whitespace-normal text-left"
                    onClick={onUsers}
                  >
                    Revisar acessos e convites
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-auto min-h-11 justify-between whitespace-normal text-left"
                    onClick={() => onCompanies("suspensa")}
                  >
                    Revisar {summary.suspended} empresas suspensas
                    <ArrowRight />
                  </Button>
                </div>
              </section>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Atualize os indicadores para consultar as mudanças mais recentes.
            </p>
          </>
        )
      )}
      <RecentActivities revision={revision} onAction={onAction} />
    </section>
  );
}
