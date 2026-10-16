import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/lib/management";
import { BILLING_PLANS, billingPlan, money, SUBSCRIPTION_STATUS } from "@/lib/billing";
import { MasterModal, Field, Feedback, SaveButton } from "./Shared";
export type SubscriptionCompany = Pick<
  Company,
  "id" | "name" | "cnpj" | "plan" | "subscription_started_on" | "subscription_status" | "updated_at"
>;
export type SubscriptionChange = Pick<
  Company,
  "plan" | "subscription_started_on" | "subscription_status"
>;
export function SubscriptionModal({
  company,
  onClose,
  onSaved,
}: {
  company: SubscriptionCompany;
  onClose: () => void;
  onSaved: (before: SubscriptionCompany, after: SubscriptionChange) => Promise<void>;
}) {
  const [plan, setPlan] = useState(company.plan);
  const [started, setStarted] = useState(company.subscription_started_on ?? "");
  const [status, setStatus] = useState(company.subscription_status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = billingPlan(plan);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (status === "ativa" && !started) {
      setError("Informe a data de adesão para ativar a assinatura.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        plan,
        subscription_started_on: started || null,
        subscription_status: status,
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
                  {p.name} · {money(p.monthlyCents)}/mês
                </option>
              ))}
            </SystemSelect>
          </Field>
          {selected && (
            <div className="rounded-xl border bg-secondary/30 p-4">
              <p className="text-lg font-semibold">
                {money(selected.monthlyCents * selected.months)} por ciclo
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Período de {selected.months} {selected.months === 1 ? "mês" : "meses"} · equivalente
                a {money(selected.monthlyCents)}/mês.
              </p>
            </div>
          )}
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
