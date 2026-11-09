import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  BILLING_PLANS,
  billingPlan,
  centsInput,
  money,
  parseCents,
  type BillingCycle,
  type BillingPrices,
} from "@/lib/billing";
import { saveBillingPrices } from "@/lib/billing-prices";
import { Feedback } from "./Shared";

const CYCLES = Object.keys(BILLING_PLANS) as BillingCycle[];
const toDraft = (prices: BillingPrices) =>
  Object.fromEntries(CYCLES.map((c) => [c, centsInput(prices[c])])) as Record<BillingCycle, string>;

/** Tabela de preços da mensalidade (SQL 34). Vale para contratos novos; os já gerados não mudam. */
export function BillingPricesCard({
  prices,
  installed,
  onSaved,
}: {
  prices: BillingPrices;
  installed: boolean;
  onSaved: (before: BillingPrices, after: BillingPrices) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(prices));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const start = () => {
    setDraft(toDraft(prices));
    setError("");
    setNotice("");
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = { ...prices };
    for (const cycle of CYCLES) {
      const cents = parseCents(draft[cycle]);
      if (cents === null || cents < 100 || cents > 10000000) {
        setError(`Informe um valor mensal válido para o plano ${BILLING_PLANS[cycle].name}.`);
        return;
      }
      next[cycle] = cents;
    }
    setBusy(true);
    setError("");
    try {
      await saveBillingPrices(next);
      await onSaved(prices, next);
      setEditing(false);
      setNotice("Valores atualizados. Valem para os próximos contratos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar os valores.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Planos e valores</h2>
      <p className="mt-1 text-xs text-muted-foreground">Mensal, trimestral e anual</p>
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="clients-toolbar mt-4 space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
            {CYCLES.map((cycle) => {
              const cents = parseCents(draft[cycle]);
              return (
                <label key={cycle} className="block text-sm">
                  <span className="font-medium">{BILLING_PLANS[cycle].name} · por mês</span>
                  <input
                    className="mt-1"
                    inputMode="decimal"
                    required
                    value={draft[cycle]}
                    onChange={(e) => setDraft({ ...draft, [cycle]: e.target.value })}
                    aria-describedby={`price-${cycle}-total`}
                  />
                  <span
                    id={`price-${cycle}-total`}
                    className="mt-1 block text-xs text-muted-foreground"
                  >
                    {cents
                      ? `${money(cents * BILLING_PLANS[cycle].months)} por ciclo`
                      : "Valor em reais, ex.: 59,90"}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            O novo valor entra nos contratos gerados a partir de agora. Contratos já gerados e
            empresas com valor negociado não mudam.
          </p>
          <Feedback error={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar valores"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {CYCLES.map((cycle) => {
              const plan = billingPlan(cycle, prices)!;
              return (
                <div key={cycle}>
                  <h3 className="font-medium">{plan.name}</h3>
                  <p className="mt-1 text-lg font-semibold">
                    {money(plan.monthlyCents)}
                    <span className="text-xs font-normal">/mês</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {money(plan.totalCents)} por ciclo
                  </p>
                </div>
              );
            })}
          </div>
          {notice && (
            <p role="status" className="mt-4 text-sm">
              {notice}
            </p>
          )}
          <div className="mt-4 border-t pt-4">
            {installed ? (
              <Button variant="outline" onClick={start}>
                Alterar valores
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Para alterar os valores, aplique o SQL 34 (valores da mensalidade) neste ambiente.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
