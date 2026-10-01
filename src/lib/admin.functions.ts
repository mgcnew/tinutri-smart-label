import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin_master", "nutricionista", "admin_cliente", "gerente", "operator"] as const;
const STATUSES = ["ativa", "inativa", "suspensa"] as const;

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  clientId: z.string().uuid().nullable().optional(),
  password: z.string().min(8).max(72).optional(),
});

const upsertClientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().trim().max(160).nullable().optional(),
  cnpj: z.string().trim().max(20).nullable().optional(),
  city: z.string().trim().max(80).default(""),
  state: z.string().trim().max(2).default(""),
  status: z.enum(STATUSES).default("ativa"),
  responsible_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  plan: z.string().trim().max(40).default("essencial"),
});

const setStatusSchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(STATUSES),
});

const carteiraSchema = z.object({
  nutritionistUserId: z.string().uuid(),
  clientId: z.string().uuid(),
});

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  redirectTo: z.string().url().optional(),
});

async function assertAdmin(userId: string, supabase: { from: (table: string) => unknown }) {
  const client = supabase as typeof import("@supabase/supabase-js").SupabaseClient.prototype;
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "admin_master"])
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito ao Admin Master TiNutri.");
}

export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("O administrador inicial já foi configurado.");

    const email =
      typeof context.claims.email === "string" ? context.claims.email : "administrador@tinutri.app";
    const name = "Administrador TiNutri";
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: context.userId,
        name,
        email,
        client_id: null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) throw new Error("Não foi possível criar o perfil administrativo.");
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId,
      role: "admin_master" as never,
    });
    if (roleError) throw new Error("Não foi possível ativar o administrador.");
    return { ok: true };
  });

export const inviteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createUserSchema.parse({ ...(input as object), role: "operator" }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name },
    });
    if (error || !created.user)
      throw new Error(error?.message ?? "Não foi possível enviar o convite.");
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: created.user.id,
      client_id: data.clientId ?? null,
      name: data.name,
      email: data.email,
    });
    if (profileError) throw new Error("Convite enviado, mas o perfil não pôde ser vinculado.");
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "operator" });
    if (data.clientId) {
      await supabaseAdmin.from("collaborators").insert({
        user_id: created.user.id,
        client_id: data.clientId,
        name: data.name,
        email: data.email,
      });
    }
    return { ok: true };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const needsClient =
      data.role === "admin_cliente" || data.role === "gerente" || data.role === "operator";
    if (needsClient && !data.clientId) throw new Error("Selecione a empresa do usuário.");
    if (needsClient) {
      const { data: company, error } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("id", data.clientId!)
        .maybeSingle();
      if (error || !company) throw new Error("Selecione uma empresa válida.");
    }
    let userId: string;
    if (data.password) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.name },
      });
      if (error || !created.user)
        throw new Error(error?.message ?? "Não foi possível criar o usuário.");
      userId = created.user.id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        {
          data: { full_name: data.name },
        },
      );
      if (error || !created.user)
        throw new Error(error?.message ?? "Não foi possível convidar o usuário.");
      userId = created.user.id;
    }
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: userId,
        client_id: needsClient ? (data.clientId ?? null) : null,
        name: data.name,
        email: data.email,
      },
      { onConflict: "user_id" },
    );
    if (profileError)
      throw new Error(
        "Conta criada, mas o perfil não pôde ser vinculado. Revise o cadastro antes de tentar novamente.",
      );
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role as never });
    if (roleError)
      throw new Error(
        "Conta criada, mas as permissões não foram atribuídas. Revise o cadastro antes de tentar novamente.",
      );
    if (data.role === "operator" && data.clientId) {
      const { error: collaboratorError } = await supabaseAdmin.from("collaborators").insert({
        user_id: userId,
        client_id: data.clientId,
        name: data.name,
        email: data.email,
      });
      if (collaboratorError)
        throw new Error("Conta criada, mas o colaborador não pôde ser vinculado à equipe.");
    }
    return { ok: true, userId };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => resetPasswordSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (error || !u.user?.email) throw new Error("Usuário não encontrado.");
    // Use the authenticated request origin, never an arbitrary redirect from input.
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const origin = new URL(request.url).origin;
    const { error: linkError } = await context.supabase.auth.resetPasswordForEmail(u.user.email, {
      redirectTo: `${origin}/reset-password`,
    });
    if (linkError) throw new Error("Não foi possível enviar o link de redefinição.");
    return { ok: true };
  });

export const listAllClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("clients").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertClientSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      legal_name: data.legal_name ?? null,
      cnpj: data.cnpj ?? null,
      city: data.city,
      state: data.state,
      status: data.status,
      responsible_name: data.responsible_name || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      plan: data.plan,
      active: data.status === "ativa",
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("clients").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("clients")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const setClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => setStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ status: data.status, active: data.status === "ativa" })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id,name,email,client_id").order("name"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
    ]);
    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) roleByUser.set(r.user_id, r.role as unknown as string);
    return (profiles ?? []).map((p) => ({ ...p, role: roleByUser.get(p.user_id) ?? null }));
  });

export const assignNutritionistClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => carteiraSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [role, company] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.nutritionistUserId)
        .eq("role", "nutricionista" as never)
        .maybeSingle(),
      supabaseAdmin.from("clients").select("id").eq("id", data.clientId).maybeSingle(),
    ]);
    if (role.error || !role.data) throw new Error("Selecione uma nutricionista válida.");
    if (company.error || !company.data) throw new Error("Selecione uma empresa válida.");
    const { error } = await supabaseAdmin
      .from("nutritionist_clients")
      .insert({ nutritionist_user_id: data.nutritionistUserId, client_id: data.clientId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const removeNutritionistClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => carteiraSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("nutritionist_clients")
      .delete()
      .eq("nutritionist_user_id", data.nutritionistUserId)
      .eq("client_id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCarteira = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("nutritionist_clients")
      .select("nutritionist_user_id,client_id");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const masterStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [clients, products, collabs, labels] = await Promise.all([
      supabaseAdmin.from("clients").select("id,name,status"),
      supabaseAdmin.from("products").select("id,client_id").eq("active", true),
      supabaseAdmin.from("collaborators").select("id,client_id").eq("active", true),
      supabaseAdmin.from("issued_labels").select("id,client_id"),
    ]);
    const byClient = new Map<
      string,
      { name: string; status: string; products: number; collaborators: number; labels: number }
    >();
    for (const c of clients.data ?? [])
      byClient.set(c.id, {
        name: c.name,
        status: c.status as unknown as string,
        products: 0,
        collaborators: 0,
        labels: 0,
      });
    for (const p of products.data ?? []) {
      const row = byClient.get(p.client_id);
      if (row) row.products += 1;
    }
    for (const c of collabs.data ?? []) {
      const row = byClient.get(c.client_id);
      if (row) row.collaborators += 1;
    }
    for (const l of labels.data ?? []) {
      const row = byClient.get(l.client_id);
      if (row) row.labels += 1;
    }
    return {
      totals: {
        clients: byClient.size,
        products: products.data?.length ?? 0,
        collaborators: collabs.data?.length ?? 0,
        labels: labels.data?.length ?? 0,
      },
      perClient: Array.from(byClient.entries()).map(([id, v]) => ({ id, ...v })),
    };
  });
