import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "admin_master" | "nutricionista" | "admin_cliente" | "operator" | null;
export type ClientStatus = "ativa" | "inativa" | "suspensa";

export type UserContext = {
  userId: string;
  email: string | null;
  name: string | null;
  role: AppRole;
  clientId: string | null;
  clientName: string | null;
  clientStatus: ClientStatus | null;
  carteira: string[]; // nutricionista — ids dos clientes
};

export const getCurrentUserContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserContext> => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roleRow }] = await Promise.all([
      supabase.from("profiles").select("name,email,client_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    let role: AppRole = null;
    const raw = (roleRow?.role as unknown as string) ?? null;
    if (raw === "admin" || raw === "admin_master") role = "admin_master";
    else if (raw === "nutricionista") role = "nutricionista";
    else if (raw === "admin_cliente") role = "admin_cliente";
    else if (raw === "operator") role = "operator";

    let clientName: string | null = null;
    let clientStatus: ClientStatus | null = null;
    if (profile?.client_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("name,status")
        .eq("id", profile.client_id)
        .maybeSingle();
      clientName = c?.name ?? null;
      clientStatus = (c?.status as unknown as ClientStatus | undefined) ?? null;
    }

    let carteira: string[] = [];
    if (role === "nutricionista") {
      const { data } = await supabase
        .from("nutritionist_clients")
        .select("client_id")
        .eq("nutritionist_user_id", userId);
      carteira = (data ?? []).map((row) => row.client_id as string);
    }

    return {
      userId,
      email:
        profile?.email ?? (typeof context.claims.email === "string" ? context.claims.email : null),
      name: profile?.name ?? null,
      role,
      clientId: profile?.client_id ?? null,
      clientName,
      clientStatus,
      carteira,
    };
  });
