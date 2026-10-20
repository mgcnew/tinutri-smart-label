import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { commercialSchema, offerStage, tokenSchema, type Offer } from "./domain";
export const offerDb = supabaseAdmin as unknown as SupabaseClient;
export const hash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
export const newOfferToken = () => randomBytes(32).toString("base64url");
export { signatureEnvironment, signatureAvailable, offerLink } from "./config.server";
export async function loadOfferByToken(token: string): Promise<Offer> {
  tokenSchema.parse(token);
  const { data, error } = await offerDb
    .from("contract_offers")
    .select("*")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (error || !data || ["revoked", "expired"].includes(offerStage(data as Offer)))
    throw new Error("Este link está indisponível ou expirou. Solicite um novo link à TiNutri.");
  commercialSchema.parse(data.commercial);
  return data as Offer;
}
export async function loadOffer(id: string): Promise<Offer> {
  const { data, error } = await offerDb.from("contract_offers").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Contratação não encontrada.");
  return data as Offer;
}
export async function event(offerId: string, kind: string, detail: Record<string, string> = {}) {
  const { error } = await offerDb
    .from("contract_offer_events")
    .insert({ offer_id: offerId, kind, detail });
  if (error) throw new Error("Não foi possível registrar o evento da contratação.");
}
export async function patchOffer(id: string, patch: Partial<Offer>) {
  const { error } = await offerDb
    .from("contract_offers")
    .update(patch)
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw new Error("Não foi possível atualizar a contratação.");
}
export async function requireMaster(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "admin_master"])
    .limit(1);
  if (error || !data?.length) throw new Error("Acesso restrito à Área Master.");
}
