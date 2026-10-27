import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import { management } from "@/lib/management";
import { buildPortfolioReportHtml, type CareEntry } from "@/lib/portfolio-report";
import { printHtml } from "@/lib/print-html";
import {
  careDraft,
  PORTFOLIO_CARE_PREFIX,
  rankPortfolio,
  type HealthLevel,
  type PortfolioRow,
} from "@/lib/portfolio";

/** Função do SQL 31 ainda fora dos tipos gerados do Supabase. */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

const PERIODS = [
  { days: 7, label: "Últimos 7 dias" },
  { days: 30, label: "Últimos 30 dias" },
  { days: 90, label: "Últimos 90 dias" },
] as const;

const LEVEL: Record<HealthLevel, { label: string; icon: typeof AlertTriangle }> = {
  critical: { label: "Crítica", icon: AlertTriangle },
  attention: { label: "Atenção", icon: CalendarClock },
  ok: { label: "Em dia", icon: CircleCheck },
  suspended: { label: "Suspensa", icon: PauseCircle },
};

export function PortfolioPanel({
  onOpenValidities,
  onOpenCare,
}: {
  onOpenValidities: (clientId: string) => void;
  onOpenCare: () => void;
}) {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<PortfolioRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Ocorrências da carteira ainda abertas, por empresa: evitam registrar o mesmo alerta duas vezes.
  const [openCare, setOpenCare] = useState<Record<string, string>>({});
  const [registering, setRegistering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  // Relatório do período: empresa aberta para escrever as recomendações antes de gerar o PDF.
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      const { data, error: failure } = await rpc("portfolio_health", { p_days: days });
      if (!alive) return;
      setLoading(false);
      if (failure) {
        setError(
          failure.code === "PGRST202"
            ? "O painel da carteira ainda não foi instalado no banco (SQL 31)."
            : "Não foi possível carregar os indicadores. Tente novamente.",
        );
        return;
      }
      setRows((data as PortfolioRow[] | null) ?? []);
      setUpdatedAt(new Date());
      const care = await management
        .from("care_records")
        .select("client_id,created_at")
        .neq("status", "concluida")
        .like("title", `${PORTFOLIO_CARE_PREFIX}%`)
        .order("created_at", { ascending: true });
      if (!alive || care.error) return;
      const open: Record<string, string> = {};
      for (const item of care.data ?? []) open[item.client_id] ??= item.created_at;
      setOpenCare(open);
    })();
    return () => {
      alive = false;
    };
  }, [days, attempt]);

  const ranked = useMemo(() => (rows ? rankPortfolio(rows) : []), [rows]);

  const registerCare = async (
    row: PortfolioRow,
    health: ReturnType<typeof rankPortfolio>[number]["health"],
  ) => {
    const draft = careDraft(row, health, days);
    if (!draft || registering) return;
    setRegistering(row.id);
    setNotice(null);
    const { error: failure } = await management
      .from("care_records")
      .insert(draft)
      .select("id")
      .single();
    setRegistering(null);
    if (failure) {
      setNotice({
        text: `Não foi possível registrar a ocorrência de ${row.name}. Tente novamente.`,
        error: true,
      });
      return;
    }
    setOpenCare((current) => ({ ...current, [row.id]: new Date().toISOString() }));
    setNotice({
      text: `Ocorrência registrada para ${row.name}. Acompanhe e conclua no Acompanhamento.`,
      error: false,
    });
  };
  const printReport = async (
    row: PortfolioRow,
    health: ReturnType<typeof rankPortfolio>[number]["health"],
  ) => {
    setReporting(true);
    setNotice(null);
    const generatedAt = new Date();
    const since = new Date(generatedAt.getTime() - days * 86_400_000).toISOString();
    const [care, auth] = await Promise.all([
      management
        .from("care_records")
        .select("kind,title,status,created_at,resolution")
        .eq("client_id", row.id)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase.auth.getUser(),
    ]);
    const profile = auth.data.user
      ? await supabase
          .from("profiles")
          .select("name")
          .eq("user_id", auth.data.user.id)
          .maybeSingle()
      : null;
    setReporting(false);
    if (care.error) {
      setNotice({ text: "Não foi possível montar o relatório. Tente novamente.", error: true });
      return;
    }
    printHtml(
      buildPortfolioReportHtml({
        row,
        health,
        days,
        generatedAt,
        consultant: profile?.data?.name ?? "",
        care: (care.data ?? []) as CareEntry[],
        recommendations,
      }),
    );
    setReportFor(null);
    setRecommendations("");
  };
  const counts = useMemo(() => {
    const total: Record<HealthLevel, number> = { critical: 0, attention: 0, ok: 0, suspended: 0 };
    for (const item of ranked) total[item.health.level] += 1;
    return total;
  }, [ranked]);

  return (
    <section className="space-y-6" aria-labelledby="portfolio-title">
      <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="portfolio-title">Carteira</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Como está cada cliente no período. Quem precisa de atenção aparece primeiro, com o
            motivo.
          </p>
        </div>
      </header>

      <div className="dashboard-context flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 items-center gap-3 text-xs font-semibold sm:max-w-xs">
          Período
          <SystemSelect
            aria-label="Período dos indicadores"
            className="!min-w-0 !rounded-lg !py-2 text-sm"
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {PERIODS.map((period) => (
              <option key={period.days} value={period.days}>
                {period.label}
              </option>
            ))}
          </SystemSelect>
        </label>
        {rows && rows.length > 0 && (
          <p className="portfolio-summary text-sm" aria-live="polite">
            <span data-level="critical">
              {counts.critical} crítica{counts.critical === 1 ? "" : "s"}
            </span>
            <span data-level="attention">{counts.attention} com atenção</span>
            <span data-level="ok">{counts.ok} em dia</span>
            {counts.suspended > 0 && (
              <span data-level="suspended">
                {counts.suspended} suspensa{counts.suspended === 1 ? "" : "s"}
              </span>
            )}
          </p>
        )}
      </div>

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`portfolio-notice ${notice.error ? "is-error" : ""}`}
        >
          {notice.text}{" "}
          {!notice.error && (
            <button type="button" className="portfolio-link" onClick={onOpenCare}>
              Abrir o Acompanhamento
            </button>
          )}
        </p>
      )}

      {loading && !rows ? (
        <p className="rounded-xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Calculando os indicadores da carteira…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-xl border bg-card px-5 py-6 text-sm">
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw /> Tentar novamente
          </Button>
        </div>
      ) : ranked.length === 0 ? (
        <p className="rounded-xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhuma empresa na sua carteira. O Master vincula as empresas que você acompanha.
        </p>
      ) : (
        <ol className="portfolio-list rounded-xl border bg-card" aria-busy={loading}>
          {ranked.map(({ row, health }) => {
            const level = LEVEL[health.level];
            return (
              <li key={row.id} className="portfolio-row" data-level={health.level}>
                <div className="portfolio-head">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{row.name}</h2>
                    <p className="portfolio-badge" data-level={health.level}>
                      <level.icon aria-hidden="true" />
                      {level.label}
                    </p>
                  </div>
                  <div className="portfolio-actions">
                    {(health.level === "critical" || health.level === "attention") &&
                      (openCare[row.id] ? (
                        <Button variant="ghost" onClick={onOpenCare}>
                          Ocorrência aberta desde {format(new Date(openCare[row.id]), "dd/MM")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={registering !== null}
                          onClick={() => void registerCare(row, health)}
                        >
                          {registering === row.id ? "Registrando…" : "Registrar ocorrência"}
                        </Button>
                      ))}
                    <Button variant="outline" onClick={() => onOpenValidities(row.id)}>
                      Ver validades
                    </Button>
                    <Button
                      variant="outline"
                      aria-expanded={reportFor === row.id}
                      onClick={() => {
                        setReportFor(reportFor === row.id ? null : row.id);
                        setRecommendations("");
                      }}
                    >
                      Relatório do período
                    </Button>
                  </div>
                </div>

                {reportFor === row.id && (
                  <div className="portfolio-report">
                    <label htmlFor={`report-${row.id}`} className="text-xs font-semibold">
                      Recomendações para o cliente (opcional)
                    </label>
                    <textarea
                      id={`report-${row.id}`}
                      value={recommendations}
                      maxLength={2000}
                      rows={4}
                      onChange={(event) => setRecommendations(event.target.value)}
                      placeholder="Ex.: conferir as etiquetas da geladeira 2 toda manhã e dar baixa no que vencer."
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Abre a impressão do navegador: escolha &quot;Salvar como PDF&quot; para
                        enviar ao cliente.
                      </p>
                      <Button disabled={reporting} onClick={() => void printReport(row, health)}>
                        {reporting ? "Montando…" : "Gerar relatório"}
                      </Button>
                    </div>
                  </div>
                )}

                <dl className="portfolio-metrics">
                  <Metric
                    term="Vencidos sem baixa"
                    value={row.expired_open}
                    alert={row.expired_open > 0}
                  />
                  <Metric term="Vencem em 3 dias" value={row.expiring_soon} />
                  <Metric term="Emitidas" value={row.issued} />
                  <Metric term="Baixas" value={row.settled} />
                  <div>
                    <dt>Descarte</dt>
                    <dd>
                      {health.discardRate === null
                        ? "—"
                        : `${Math.round(health.discardRate * 100)}%`}
                      {health.discardTrend === "worse" && (
                        <ArrowUpRight
                          className="portfolio-trend"
                          data-trend="worse"
                          aria-label="piorou"
                        />
                      )}
                      {health.discardTrend === "better" && (
                        <ArrowDownRight
                          className="portfolio-trend"
                          data-trend="better"
                          aria-label="melhorou"
                        />
                      )}
                    </dd>
                  </div>
                  <Metric term="Conferências QR" value={row.checks} />
                  <div>
                    <dt>Última emissão</dt>
                    <dd>
                      {row.last_issued_at
                        ? format(new Date(row.last_issued_at), "dd/MM HH:mm")
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {health.reasons.length > 0 && health.level !== "suspended" && (
                  <ul className="portfolio-reasons">
                    {health.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                {row.top_products.length > 0 && health.level !== "suspended" && (
                  <p className="text-xs text-muted-foreground">
                    Mais vencem ou são descartados:{" "}
                    {row.top_products
                      .map((product) => `${product.name} (${product.count})`)
                      .join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          Atualizado às {format(updatedAt, "HH:mm")}. Calculado com as etiquetas, baixas e
          conferências registradas no sistema.
        </p>
      )}
    </section>
  );
}

function Metric({ term, value, alert = false }: { term: string; value: number; alert?: boolean }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd data-alert={alert || undefined}>{value}</dd>
    </div>
  );
}
