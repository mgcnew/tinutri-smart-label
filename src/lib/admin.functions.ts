import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().min(2).max(120),
  clientId: z.string().uuid(),
});

async function assertAdmin(userId: string, supabase: { from: (table: string) => unknown }) {
  const client = supabase as typeof import("@supabase/supabase-js").SupabaseClient.prototype;
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito ao administrador TiNutri.");
}

export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("O administrador inicial já foi configurado.");

    const email = typeof context.claims.email === "string" ? context.claims.email : "administrador@tinutri.app";
    const name = "Administrador TiNutri";
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      user_id: context.userId,
      name,
      email,
      client_id: null,
    }, { onConflict: "user_id" });
    if (profileError) throw new Error("Não foi possível criar o perfil administrativo.");
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId,
      role: "admin",
    });
    if (roleError) throw new Error("Não foi possível ativar o administrador.");
    return { ok: true };
  });

export const inviteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível enviar o convite.");
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: created.user.id,
      client_id: data.clientId,
      name: data.name,
      email: data.email,
    });
    if (profileError) throw new Error("Convite enviado, mas o perfil não pôde ser vinculado.");
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "operator" });
    await supabaseAdmin.from("collaborators").insert({
      user_id: created.user.id,
      client_id: data.clientId,
      name: data.name,
      email: data.email,
    });
    return { ok: true };
  });