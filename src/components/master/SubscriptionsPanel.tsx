import { useCallback, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { supabase } from "@/integrations/supabase/client";
import { BILLING_PLANS, billingPlan, money, displayDate, SUBSCRIPTION_STATUS } from "@/lib/billing";
import { errorMessage } from "@/lib/management";
import { searchColumns } from "@/lib/list-query";
import {
  SubscriptionModal,
  type SubscriptionCompany,
  type SubscriptionChange,
} from "./SubscriptionModal";
export function SubscriptionsPanel({
  revision,
  onSaved,
  onContracts,
}: {
  revision: number;
  onSaved: (before: SubscriptionCompany, after: SubscriptionChange) => Promise<void>;
  onContracts: (id: string) => void;
}) {
  const [editing, setEditing] = useState<SubscriptionCompany | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const term = useDebouncedValue(search.trim());
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      let query = supabase
        .from("clients")
        .select("id,name,cnpj,plan,subscription_status,subscription_started_on,updated_at", {
          count: "exact",
        })
        .order("name")
        .order("id")
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (term) query = query.or(searchColumns(["name", "legal_name", "cnpj"], term));
      if (status) query = query.eq("subscription_status", status);
      const { data, error, count } = await query;
      if (error)
        throw new Error(
          error.code === "42703" || error.code === "PGRST204"
            ? "Este recurso aguarda ativação: aplique o SQL 19 de assinaturas e contratos neste ambiente."
            : errorMessage(error),
        );
      if (count === null) throw new Error("Não foi possível consultar o total.");
      return { rows: data ?? [], total: count };
    },
    [term, status],
  );
  const listing = usePaginatedQuery(JSON.stringify([term, status]), load, revision);
  return (
    <section className="space-y-6">
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Consultar planos e valores{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Mensal, trimestral e anual
          </span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.entries(BILLING_PLANS).map(([key, plan]) => (
            <div key={key}>
              <h2 className="font-medium">{plan.name}</h2>
              <p className="mt-1 text-lg font-semibold">
                {money(plan.monthlyCents)}
                <span className="text-xs font-normal">/mês</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {money(plan.monthlyCents * plan.months)} por ciclo
              </p>
            </div>
          ))}
        </div>
      </details>
      {notice && (
        <p role="status" className="clients-notice flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          {notice}
        </p>
      )}
      <div className="clients-toolbar grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <input
          aria-label="Buscar assinatura por empresa"
          placeholder="Buscar empresa ou CNPJ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SystemSelect
          aria-label="Situação da assinatura"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todas as situações comerciais</option>
          {Object.entries(SUBSCRIPTION_STATUS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SystemSelect>
      </div>
      {listing.loading || listing.error ? (
        <PageLoading error={listing.error} retry={listing.reload} />
      ) : !listing.rows.length ? (
        <p className="rounded-xl border p-8 text-center text-muted-foreground">
          Nenhuma empresa encontrada para esses filtros.
        </p>
      ) : (
        <div className="space-y-3">
          {listing.rows.map((company) => {
            const plan = billingPlan(company.plan);
            return (
              <article key={company.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{company.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {company.cnpj || "CNPJ não informado"}
                    </p>
                  </div>
                  <span className="client-plan">
                    {SUBSCRIPTION_STATUS[
                      company.subscription_status as keyof typeof SUBSCRIPTION_STATUS
                    ] ?? "Aguardando revisão"}
                  </span>
                </div>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  {[
                    ["Plano", plan?.name ?? `${company.plan} (legado)`],
                    [
                      "Valor por ciclo",
                      plan ? money(plan.monthlyCents * plan.months) : "Revisar plano",
                    ],
                    ["Adesão", displayDate(company.subscription_started_on)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNotice("");
                      setEditing(company);
                    }}
                  >
                    Gerenciar assinatura
                  </Button>
                  <Button variant="ghost" onClick={() => onContracts(company.id)}>
                    Ver contratos
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && (
        <SubscriptionModal
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={async (before, after) => {
            await onSaved(before, after);
            setNotice("Assinatura atualizada.");
          }}
        />
      )}
      <PaginationControls
        page={listing.page}
        size={listing.size}
        total={listing.total}
        loading={listing.loading}
        onPageChange={listing.setPage}
        onSizeChange={listing.setSize}
      />
    </section>
  );
}
