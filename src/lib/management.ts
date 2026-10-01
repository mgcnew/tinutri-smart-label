import { addDays, endOfDay, startOfDay } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type CareRecord = {
  id: string;
  client_id: string;
  kind: "tarefa" | "ocorrencia" | "visita";
  title: string;
  description: string;
  status: "aberta" | "em_andamento" | "concluida";
  priority: "baixa" | "normal" | "alta";
  assigned_to: string | null;
  assigned_name: string | null;
  due_on: string | null;
  next_visit_on: string | null;
  reason: string | null;
  product_name: string | null;
  resolution: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  company?: { name: string } | null;
};
export type Company = Database["public"]["Tables"]["clients"]["Row"] & { nutritionists?: string[] };
export type MasterUser = {
  user_id: string;
  name: string;
  email: string;
  role: string | null;
  client_id: string | null;
  company_name: string | null;
  access_status: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
  client_count: number;
};
export type Summary = {
  companies: number;
  active: number;
  suspended: number;
  unassigned: number;
  products: number;
  team: number;
  issued: number;
  discarded: number;
  expired: number;
  today: number;
  three: number;
  seven: number;
  open: number;
  overdue: number;
};
type Rpc<A> = { Args: A; Returns: Json };
type ManagementDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      care_records: {
        Row: CareRecord;
        Insert: Partial<CareRecord> & Pick<CareRecord, "client_id" | "kind" | "title">;
        Update: Partial<CareRecord>;
        Relationships: [
          {
            foreignKeyName: "care_records_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: Database["public"]["Functions"] & {
      master_directory: Rpc<{
        p_kind: string;
        p_search?: string;
        p_filter?: string;
        p_client?: string | null;
        p_offset?: number;
        p_limit?: number;
      }>;
      master_summary: Rpc<{
        p_now: string;
        p_today: string;
        p_three: string;
        p_seven: string;
        p_start: string;
        p_zone?: string;
        p_client?: string | null;
      }>;
      care_people: Rpc<{ p_client: string; p_search?: string; p_limit?: number }>;
      master_update_access: {
        Args: { p_user: string; p_name: string; p_role: string; p_client?: string | null };
        Returns: undefined;
      };
    };
  };
};
export const management = supabase as unknown as SupabaseClient<ManagementDatabase>;
export const ROLE_NAMES: Record<string, string> = {
  admin_master: "Admin Master",
  admin: "Admin Master",
  nutricionista: "Nutricionista",
  admin_cliente: "Administrador da empresa",
  gerente: "Gerente",
  operator: "Colaborador",
};
export const KIND_NAMES = {
  tarefa: "Pendência",
  ocorrencia: "Ocorrência",
  visita: "Visita técnica",
};
export const CARE_STATUS = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};
export const careUnavailable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && ["42P01", "PGRST202", "PGRST205"].includes(error.code ?? ""));
export function errorMessage(error: { code?: string; message?: string } | null) {
  return careUnavailable(error)
    ? "Este recurso aguarda ativação neste ambiente. As demais áreas continuam disponíveis."
    : "Não foi possível consultar os dados. Tente novamente.";
}
export function pageResult<T>(value: Json) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.rows) ||
    typeof value.total !== "number"
  )
    throw new Error("Resposta inválida");
  return { rows: value.rows as unknown as T[], total: value.total };
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[=+@\-\t\r\n]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(["\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const summaryArgs = (client: string | null, days = 30) => {
  const now = new Date();
  return {
    p_now: now.toISOString(),
    p_today: endOfDay(now).toISOString(),
    p_three: endOfDay(addDays(now, 3)).toISOString(),
    p_seven: endOfDay(addDays(now, 7)).toISOString(),
    p_start: startOfDay(addDays(now, -days)).toISOString(),
    p_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_client: client,
  };
};
