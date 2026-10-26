import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  role: z.enum(["operator", "gerente"]),
});

/**
 * Convite feito pela própria empresa (gerente ou administrador): cria o acesso por e-mail na empresa dele.
 * Quem pode convidar e com qual perfil é decidido no banco (can_invite_member), não aqui.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await (
      context.supabase as unknown as {
        rpc: (name: string, args: object) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("can_invite_member", { p_client: data.clientId, p_role: data.role });
    if (allowed.error || allowed.data !== true)
      throw new Error("Você não tem permissão para convidar este perfil.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name },
    });
    if (error || !created.user)
      throw new Error(error?.message ?? "Não foi possível enviar o convite.");
    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { user_id: userId, client_id: data.clientId, name: data.name, email: data.email },
        { onConflict: "user_id" },
      );
    if (profileError)
      throw new Error(
        "Convite enviado, mas o perfil não pôde ser vinculado. Fale com o suporte antes de tentar de novo.",
      );
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role as never });
    if (roleError)
      throw new Error(
        "Convite enviado, mas o perfil de acesso não foi atribuído. Fale com o suporte antes de tentar de novo.",
      );
    if (data.role === "operator") {
      // Colaborador também aparece como responsável nas etiquetas.
      await supabaseAdmin
        .from("collaborators")
        .insert({ user_id: userId, client_id: data.clientId, name: data.name, email: data.email });
    }
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      client_id: data.clientId,
      action: "usuario_convidado",
      entity_type: "user",
      entity_id: userId,
      metadata: { role: data.role, email: data.email },
    } as never);
    return { ok: true as const, userId };
  });
