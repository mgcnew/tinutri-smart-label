import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { ContractProvider, ContractTerms } from "./contract-template";

/** Dados fixos da TiNutri (SQL 33), usados para preencher contratos novos. */
export type TinutriProfile = {
  legal_name: string;
  cnpj: string;
  address: string;
  representative: string;
  representative_email: string;
  email: string;
  phone: string;
  support_channel: string;
  support_hours: string;
  export_days: number | null;
  updated_at?: string;
};
export const EMPTY_PROFILE: TinutriProfile = {
  legal_name: "",
  cnpj: "",
  address: "",
  representative: "",
  representative_email: "",
  email: "",
  phone: "",
  support_channel: "",
  support_hours: "",
  export_days: null,
};
type ProfileDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      tinutri_profile: {
        Row: TinutriProfile & { id: boolean };
        Insert: Partial<TinutriProfile> & { id?: boolean };
        Update: Partial<TinutriProfile>;
        Relationships: [];
      };
    };
  };
};
const profiles = supabase as unknown as SupabaseClient<ProfileDatabase>;
const COLUMNS =
  "legal_name,cnpj,address,representative,representative_email,email,phone,support_channel,support_hours,export_days,updated_at";

/** Devolve null quando ainda não há cadastro; erro quando o SQL 33 não foi aplicado. */
export async function loadTinutriProfile(signal?: AbortSignal) {
  let query = profiles.from("tinutri_profile").select(COLUMNS).eq("id", true);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw profileError(error);
  return (data as TinutriProfile | null) ?? null;
}
export async function saveTinutriProfile(profile: TinutriProfile) {
  const { updated_at: _ignored, ...values } = profile;
  const clean = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  ) as Omit<TinutriProfile, "updated_at">;
  const { data, error } = await profiles
    .from("tinutri_profile")
    .upsert({ id: true, ...clean })
    .select(COLUMNS)
    .single();
  if (error) throw profileError(error);
  return data as TinutriProfile;
}
function profileError(error: { code?: string; message?: string }) {
  return new Error(
    error.code === "42P01" || error.code === "PGRST205"
      ? "O cadastro da TiNutri ainda não foi instalado no banco (SQL 33)."
      : "Não foi possível acessar os dados da TiNutri. Tente novamente.",
  );
}
export function profileProvider(profile: TinutriProfile | null): ContractProvider {
  return {
    legalName: profile?.legal_name ?? "",
    cnpj: profile?.cnpj ?? "",
    address: profile?.address ?? "",
    representative: profile?.representative ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
  };
}
export function profileTerms(
  profile: TinutriProfile | null,
): Pick<ContractTerms, "supportChannel" | "supportHours" | "exportDays"> {
  return {
    supportChannel: profile?.support_channel ?? "",
    supportHours: profile?.support_hours ?? "",
    exportDays: profile?.export_days ? String(profile.export_days) : "",
  };
}
