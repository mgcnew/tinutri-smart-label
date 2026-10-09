// Envia o resumo de validades por push. Chamada a cada poucos minutos pelo pg_cron (ver docs/16-notificacoes-push.md).
// Segredos: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente das funções.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

import { buildDigest } from "../_shared/digest.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

/** Comparação em tempo constante para o segredo da chamada. */
function sameSecret(received: string, expected: string) {
  if (!expected || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (!sameSecret(request.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) {
    return new Response("Não autorizado", { status: 401 });
  }
  if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY") || !env("VAPID_SUBJECT")) {
    return new Response("VAPID não configurado", { status: 500 });
  }
  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: digests, error } = await db.rpc("claim_alert_digests", { _soon_days: 3 });
  if (error) return new Response(`Falha ao montar avisos: ${error.message}`, { status: 500 });

  let sent = 0;
  let removed = 0;
  for (const row of (digests ?? []) as { user_id: string; expired: number; today: number; soon: number; sample: string[] }[]) {
    const payload = JSON.stringify(buildDigest(row));
    const { data: subscriptions } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", row.user_id);
    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: row.expired + row.today > 0 ? "high" : "normal" });
        sent += 1;
      } catch (failure) {
        const status = (failure as { statusCode?: number }).statusCode;
        // 404/410: o aparelho cancelou ou a inscrição expirou. Remove para não tentar de novo.
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
          removed += 1;
        }
      }
    }
  }
  return Response.json({ users: digests?.length ?? 0, sent, removed });
});
