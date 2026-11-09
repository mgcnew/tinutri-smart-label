import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/lib/management";
import {
  BILLING_PLANS,
  billingPlan,
  centsInput,
  money,
  parseCents,
  SUBSCRIPTION_STATUS,
  type BillingCycle,
  type BillingPrices,
} from "@/lib/billing";
import {
  DEFAULT_MIN_MONTHS,
  EQUIPMENT_MODES,
  equipmentOffer,
  equipmentSummary,
  type EquipmentModel,
} from "@/lib/equipment";
import { MasterModal, Field, Feedback, SaveButton } from "./Shared";
const EQUIPMENT_COLUMNS = [
  "equipment_mode",
  "equipment_model_id",
  "equipment_quantity",
  "equipment_custom_cents",
  "equipment_min_months",
] as const;
export type SubscriptionCompany = Pick<
  Company,
  | "id"
  | "name"
  | "cnpj"
  | "plan"
  | "custom_monthly_cents"
  | "subscription_started_on"
  | "subscription_status"
  | "updated_at"
  | (typeof EQUIPMENT_COLUMNS)[number]
>;
export type SubscriptionChange = Pick<
  Company,
  | "plan"
  | "custom_monthly_cents"
  | "subscription_started_on"
  | "subscription_status"
  | (typeof EQUIPMENT_COLUMNS)[number]
>;
export function SubscriptionModal({
  company,
  prices,
  models,
  onClose,
  onSaved,
}: {
  company: SubscriptionCompany;
  prices: BillingPrices;
  models: EquipmentModel[];
  onClose: () => void;
  onSaved: (before: SubscriptionCompany, after: SubscriptionChange) => Promise<void>;
}) {
  const [plan, setPlan] = useState(company.plan);
  const [started, setStarted] = useState(company.subscription_started_on ?? "");
  const [status, setStatus] = useState(company.subscription_status);
  const [negotiated, setNegotiated] = useState(centsInput(company.custom_monthly_cents));
  const [mode, setMode] = useState(company.equipment_mode);
  const [modelId, setModelId] = useState(company.equipment_model_id ?? "");
  const [quantity, setQuantity] = useState(String(company.equipment_quantity));
  const [equipmentNegotiated, setEquipmentNegotiated] = useState(
    centsInput(company.equipment_custom_cents),
  );
  const [minMonths, setMinMonths] = useState(String(company.equipment_min_months));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const customCents = negotiated.trim() ? parseCents(negotiated) : null;
  const selected = billingPlan(plan, prices, customCents);
  const equipmentCents = equipmentNegotiated.trim() ? parseCents(equipmentNegotiated) : null;
  const choice = {
    equipment_mode: mode,
    equipment_model_id: mode === "nenhum" ? null : modelId || null,
    equipment_quantity: Number(quantity),
    equipment_custom_cents: mode === "nenhum" ? null : equipmentCents,
    equipment_min_months: mode === "comodato" ? Number(minMonths) : DEFAULT_MIN_MONTHS,
  };
  const offer = equipmentOffer(choice, models);
  const model = models.find((m) => m.id === modelId);
  const modelOptions = models.filter((m) => m.active || m.id === company.equipment_model_id);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (status === "ativa" && !started) {
      setError("Informe a data de adesão para ativar a assinatura.");
      return;
    }
    if (
      negotiated.trim() &&
      (customCents === null || customCents < 100 || customCents > 10000000)
    ) {
      setError("Informe um valor negociado válido, ex.: 49,90, ou deixe em branco.");
      return;
    }
    if (mode !== "nenhum") {
      if (!modelId) {
        setError("Escolha o modelo da impressora.");
        return;
      }
      if (
        !/^\d+$/.test(quantity) ||
        choice.equipment_quantity < 1 ||
        choice.equipment_quantity > 50
      ) {
        setError("Informe a quantidade de impressoras, de 1 a 50.");
        return;
      }
      if (equipmentNegotiated.trim() && equipmentCents === null) {
        setError("Informe um valor negociado da impressora válido, ou deixe em branco.");
        return;
      }
      if (mode === "comodato" && (!/^\d+$/.test(minMonths) || choice.equipment_min_months > 60)) {
        setError("Informe a permanência mínima em meses, de 0 a 60.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        plan,
        custom_monthly_cents: customCents,
        subscription_started_on: started || null,
        subscription_status: status,
        ...choice,
        equipment_quantity: mode === "nenhum" ? 1 : choice.equipment_quantity,
      };
      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", company.id)
        .eq("updated_at", company.updated_at)
        .select("id")
        .maybeSingle();
      if (error) throw new Error("Não foi possível salvar a assinatura. Tente novamente.");
      if (!data)
        throw new Error(
          "O cadastro foi alterado em outra sessão. Feche e atualize a lista antes de tentar novamente.",
        );
      await onSaved(company, payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MasterModal
      open
      busy={busy}
      onClose={onClose}
      title="Gerenciar assinatura"
      description={company.name}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <SaveButton busy={busy} form="subscription-editor" label="Salvar assinatura" />
        </div>
      }
    >
      <form id="subscription-editor" onSubmit={(e) => void save(e)} className="clients-toolbar">
        <fieldset disabled={busy} className="space-y-4">
          <Field label="Período da assinatura">
            <SystemSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
              {!billingPlan(company.plan) && (
                <option value={company.plan}>{company.plan} (legado)</option>
              )}
              {Object.entries(BILLING_PLANS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.name} · {money(prices[key as BillingCycle])}/mês
                </option>
              ))}
            </SystemSelect>
          </Field>
          {selected && (
            <div className="rounded-xl border bg-secondary/30 p-4">
              <p className="text-lg font-semibold">{money(selected.totalCents)} por ciclo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Período de {selected.months} {selected.months === 1 ? "mês" : "meses"} · equivalente
                a {money(selected.monthlyCents)}/mês
                {selected.negotiated ? " (valor negociado)." : " (tabela de preços)."}
              </p>
            </div>
          )}
          <Field label="Valor mensal negociado (opcional)">
            <input
              inputMode="decimal"
              placeholder={`Tabela: ${centsInput(prices[plan as BillingCycle] ?? null) || "—"}`}
              value={negotiated}
              onChange={(e) => setNegotiated(e.target.value)}
            />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">
            Em branco, vale a tabela de preços. Preenchido, substitui a tabela só para esta empresa
            e entra no próximo contrato gerado; contratos já gerados mantêm o valor assinado.
          </p>
          <section className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Impressora</h3>
            <Field label="Modalidade">
              <SystemSelect value={mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(EQUIPMENT_MODES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SystemSelect>
            </Field>
            {mode !== "nenhum" && (
              <>
                <Field label="Modelo">
                  <SystemSelect value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    <option value="">
                      {modelOptions.length ? "Escolha o modelo" : "Cadastre uma impressora antes"}
                    </option>
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.active ? "" : " (desativada)"}
                      </option>
                    ))}
                  </SystemSelect>
                </Field>
                <Field label="Quantidade">
                  <input
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </Field>
                <Field
                  label={
                    mode === "comodato"
                      ? "Adicional mensal negociado, por unidade (opcional)"
                      : "Preço de venda negociado, por unidade (opcional)"
                  }
                >
                  <input
                    inputMode="decimal"
                    placeholder={
                      model
                        ? `Catálogo: ${centsInput(mode === "comodato" ? model.loan_monthly_cents : model.sale_cents)}`
                        : ""
                    }
                    value={equipmentNegotiated}
                    onChange={(e) => setEquipmentNegotiated(e.target.value)}
                  />
                </Field>
                {mode === "comodato" && (
                  <Field label="Permanência mínima (meses)">
                    <input
                      inputMode="numeric"
                      value={minMonths}
                      onChange={(e) => setMinMonths(e.target.value)}
                    />
                  </Field>
                )}
                {offer && (
                  <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
                    <p className="font-semibold">{equipmentSummary(offer)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {offer.mode === "comodato"
                        ? `${selected ? `${money(offer.totalCents * selected.months)} por ciclo · ` : ""}reposição de ${money(offer.replacementCents)} por unidade.`
                        : "Pagamento único."}{" "}
                      Cobrado à parte da assinatura do sistema.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
          <Field label="Situação da assinatura">
            <SystemSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(SUBSCRIPTION_STATUS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SystemSelect>
          </Field>
          <Field label="Data de adesão">
            <input
              type="date"
              required={status === "ativa"}
              value={started}
              onChange={(e) => setStarted(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Gestão manual. Esta alteração não registra pagamento nem muda o acesso da empresa.
          </p>
          <Feedback error={error} />
        </fieldset>
      </form>
    </MasterModal>
  );
}
