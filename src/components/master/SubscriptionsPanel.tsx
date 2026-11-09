import { useCallback, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { supabase } from "@/integrations/supabase/client";
import {
  billingPlan,
  money,
  displayDate,
  SUBSCRIPTION_STATUS,
  type BillingPrices,
} from "@/lib/billing";
import { useBillingPrices } from "@/lib/billing-prices";
import { equipmentOffer, equipmentSummary, type EquipmentModel } from "@/lib/equipment";
import { useEquipmentModels } from "@/lib/equipment-models";
import { errorMessage } from "@/lib/management";
import { searchColumns } from "@/lib/list-query";
import {
  SubscriptionModal,
  type SubscriptionCompany,
  type SubscriptionChange,
} from "./SubscriptionModal";
import { BillingPricesCard } from "./BillingPricesCard";
import { EquipmentCatalogCard } from "./EquipmentCatalogCard";
export function SubscriptionsPanel({
  revision,
  onSaved,
  onPricesSaved,
  onEquipmentSaved,
  onContracts,
}: {
  revision: number;
  onSaved: (before: SubscriptionCompany, after: SubscriptionChange) => Promise<void>;
  onPricesSaved: (before: BillingPrices, after: BillingPrices) => Promise<void>;
  onEquipmentSaved: (before: EquipmentModel | null, after: EquipmentModel) => Promise<void>;
  onContracts: (id: string) => void;
}) {
  const billing = useBillingPrices();
  const equipment = useEquipmentModels();
  const [editing, setEditing] = useState<SubscriptionCompany | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const term = useDebouncedValue(search.trim());
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      let query = supabase
        .from("clients")
        .select(
          "id,name,cnpj,plan,custom_monthly_cents,subscription_status,subscription_started_on,updated_at,equipment_mode,equipment_model_id,equipment_quantity,equipment_custom_cents,equipment_min_months",
          {
            count: "exact",
          },
        )
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
            ? "Este recurso aguarda ativação: aplique os SQLs 19 (assinaturas e contratos), 34 (valores da mensalidade) e 35 (impressoras) neste ambiente."
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
      <BillingPricesCard
        key={JSON.stringify(billing.prices)}
        prices={billing.prices}
        installed={billing.installed && !billing.loading && !billing.error}
        onSaved={async (before, after) => {
          await onPricesSaved(before, after);
          billing.reload();
        }}
      />
      {billing.error && <p className="text-sm text-destructive">{billing.error}</p>}
      <EquipmentCatalogCard
        models={equipment.models}
        installed={equipment.installed && !equipment.loading && !equipment.error}
        onSaved={async (before, after) => {
          await onEquipmentSaved(before, after);
          equipment.reload();
        }}
      />
      {equipment.error && <p className="text-sm text-destructive">{equipment.error}</p>}
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
            const plan = billingPlan(company.plan, billing.prices, company.custom_monthly_cents);
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
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Plano", plan?.name ?? `${company.plan} (legado)`],
                    [
                      "Valor por ciclo",
                      plan
                        ? `${money(plan.totalCents)}${plan.negotiated ? " · negociado" : ""}`
                        : "Revisar plano",
                    ],
                    ["Adesão", displayDate(company.subscription_started_on)],
                    [
                      "Impressora",
                      company.equipment_mode === "nenhum" || equipment.loading
                        ? equipmentSummary(null)
                        : (() => {
                            const offer = equipmentOffer(company, equipment.models);
                            return offer ? equipmentSummary(offer) : "Revisar impressora";
                          })(),
                    ],
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
          prices={billing.prices}
          models={equipment.models}
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
