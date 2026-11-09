import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BILLING_PLANS, DEFAULT_PRICES, type BillingCycle, type BillingPrices } from "./billing";

const missing = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205";

/** Tabela de preços (SQL 34). Sem a tabela instalada, devolve os valores antigos e `installed: false`. */
export async function loadBillingPrices(signal?: AbortSignal) {
  let query = supabase.from("billing_prices").select("cycle,monthly_cents");
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    if (missing(error)) return { prices: { ...DEFAULT_PRICES }, installed: false };
    throw new Error("Não foi possível carregar os valores da mensalidade. Tente novamente.");
  }
  const prices = { ...DEFAULT_PRICES };
  for (const row of data ?? [])
    if (Object.hasOwn(BILLING_PLANS, row.cycle))
      prices[row.cycle as BillingCycle] = row.monthly_cents;
  return { prices, installed: true };
}

export async function saveBillingPrices(prices: BillingPrices) {
  for (const cycle of Object.keys(BILLING_PLANS) as BillingCycle[]) {
    const { data, error } = await supabase
      .from("billing_prices")
      .update({ monthly_cents: prices[cycle] })
      .eq("cycle", cycle)
      .select("cycle")
      .maybeSingle();
    if (!error && !data) throw new Error("Somente o Master pode alterar os valores.");
    if (error)
      throw new Error(
        missing(error)
          ? "A tabela de valores ainda não foi instalada no banco (SQL 34)."
          : "Não foi possível salvar os valores. Tente novamente.",
      );
  }
}

export function useBillingPrices() {
  const [state, setState] = useState<{
    prices: BillingPrices;
    installed: boolean;
    loading: boolean;
    error: string;
  }>({ prices: { ...DEFAULT_PRICES }, installed: true, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadBillingPrices(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ ...result, loading: false, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: e instanceof Error ? e.message : "Falha ao carregar os valores.",
          }));
      });
    return () => controller.abort();
  }, [revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, reload };
}
