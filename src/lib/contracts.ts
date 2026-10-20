import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { contractPrintHtml } from "./contract-template";
export { contractDraft } from "./contract-template";
export const CONTRACT_STATUS = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  arquivada: "Arquivada",
} as const;
export type ServiceContract = {
  id: string;
  client_id: string;
  title: string;
  body: string;
  status: keyof typeof CONTRACT_STATUS;
  company_snapshot: Json;
  plan_snapshot: Json;
  commercial_snapshot?: Json | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type ContractsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      service_contracts: {
        Row: ServiceContract;
        Insert: Pick<
          ServiceContract,
          "client_id" | "title" | "body" | "status" | "commercial_snapshot"
        >;
        Update: Partial<Pick<ServiceContract, "title" | "body" | "status" | "commercial_snapshot">>;
        Relationships: [];
      };
    };
  };
};
export const contracts = supabase as unknown as SupabaseClient<ContractsDatabase>;
export function printContract(contract: Pick<ServiceContract, "body" | "title">) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  popup.document.open();
  popup.document.write(contractPrintHtml(contract.title, contract.body));
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
export function downloadContract(contract: Pick<ServiceContract, "body" | "title">) {
  const url = URL.createObjectURL(
    new Blob([contract.title + "\n\n" + contract.body], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "minuta-tinutri.txt";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
