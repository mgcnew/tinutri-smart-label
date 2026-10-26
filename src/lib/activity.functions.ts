import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logSchema = z.object({
  action: z.string().min(1).max(80),
  clientId: z.string().uuid().nullable().optional(),
  entityType: z.string().max(40).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => logSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
    await supabase.from("activity_logs").insert({
      user_id: userId,
      user_name: profile?.name ?? null,
      action: data.action,
      client_id: data.clientId ?? null,
      entity_type: data.entityType ?? null,
      entity_id: data.entityId ?? null,
      metadata: (data.metadata ?? {}) as never,
    });
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("activity_logs")
      .select("id,client_id,user_id,user_name,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.clientId) query = query.eq("client_id", data.clientId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });