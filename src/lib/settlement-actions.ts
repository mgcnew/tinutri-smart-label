import { supabase } from "@/integrations/supabase/client";
import type { Settlement } from "@/lib/settlement";

/**
 * Baixa uma etiqueta ativa e já impressa. Devolve "ok", "ja-baixada" (outra pessoa chegou antes)
 * ou "erro". A linha do tempo é gravada em seguida; falha nela não desfaz a baixa.
 */
export async function settleLabelRecord(input: {
  id: string;
  clientId: string;
  userId: string | null;
  userName?: string | null;
  status: Settlement;
  reason?: string | null;
}): Promise<{ result: "ok" | "ja-baixada" | "erro"; eventLogged: boolean }> {
  const { data, error } = await supabase
    .from("issued_labels")
    .update({ label_status: input.status, closed_at: new Date().toISOString(), closed_by: input.userId, closed_reason: input.reason ?? null } as never)
    .eq("id", input.id)
    .eq("label_status", "ativa")
    .eq("print_status", "confirmada")
    .select("id")
    .maybeSingle();
  if (error) return { result: "erro", eventLogged: false };
  if (!data) return { result: "ja-baixada", eventLogged: false };
  const { error: eventError } = await supabase.from("label_events").insert({
    label_id: input.id,
    client_id: input.clientId,
    event_type: `baixa_${input.status}`,
    user_id: input.userId,
    user_name: input.userName || null,
    quantity: 1,
    metadata: (input.reason ? { reason: input.reason } : {}) as never,
  });
  return { result: "ok", eventLogged: !eventError };
}
