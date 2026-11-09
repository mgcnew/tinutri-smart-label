import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EquipmentModel } from "./equipment";

const COLUMNS = "id,name,sale_cents,loan_monthly_cents,replacement_cents,active,updated_at";
const missing = (error: { code?: string }) => error.code === "42P01" || error.code === "PGRST205";

/** Catálogo de impressoras (SQL 35). Sem a tabela instalada, devolve lista vazia e `installed: false`. */
export async function loadEquipmentModels(signal?: AbortSignal) {
  let query = supabase.from("equipment_models").select(COLUMNS).order("name");
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    if (missing(error)) return { models: [] as EquipmentModel[], installed: false };
    throw new Error("Não foi possível carregar as impressoras. Tente novamente.");
  }
  return { models: (data ?? []) as EquipmentModel[], installed: true };
}

export type EquipmentModelInput = Omit<EquipmentModel, "id" | "updated_at">;
export async function saveEquipmentModel(id: string | null, values: EquipmentModelInput) {
  const clean = { ...values, name: values.name.trim() };
  const { data, error } = id
    ? await supabase
        .from("equipment_models")
        .update(clean)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle()
    : await supabase.from("equipment_models").insert(clean).select(COLUMNS).single();
  if (error)
    throw new Error(
      missing(error)
        ? "O catálogo de impressoras ainda não foi instalado no banco (SQL 35)."
        : error.code === "23505"
          ? "Já existe uma impressora com esse nome."
          : "Não foi possível salvar a impressora. Tente novamente.",
    );
  if (!data) throw new Error("Somente o Master pode alterar o catálogo de impressoras.");
  return data as EquipmentModel;
}

export function useEquipmentModels() {
  const [state, setState] = useState<{
    models: EquipmentModel[];
    installed: boolean;
    loading: boolean;
    error: string;
  }>({ models: [], installed: true, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadEquipmentModels(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ ...result, loading: false, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: e instanceof Error ? e.message : "Falha ao carregar as impressoras.",
          }));
      });
    return () => controller.abort();
  }, [revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, reload };
}
