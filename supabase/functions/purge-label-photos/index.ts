// Apaga do Storage as fotos de etiqueta mais antigas que o prazo de retenção (90 dias).
// Chamada uma vez por dia pelo pg_cron (ver docs/17-fotos-de-etiqueta.md). Protegida por CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const RETENTION_DAYS = 90;
const BATCH = 500;
const env = (name: string) => Deno.env.get(name) ?? "";

/** Comparação em tempo constante para o segredo da chamada. */
function sameSecret(received: string, expected: string) {
  if (!expected || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1)
    diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (!sameSecret(request.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) {
    return new Response("Não autorizado", { status: 401 });
  }
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  let removed = 0;
  // Vários lotes por execução, com teto, para não segurar a função por muito tempo.
  for (let round = 0; round < 10; round += 1) {
    const { data, error } = await db.rpc("label_photos_to_purge", {
      _days: RETENTION_DAYS,
      _limit: BATCH,
    });
    if (error) return new Response(`Falha ao listar fotos: ${error.message}`, { status: 500 });
    const names = ((data ?? []) as { name: string }[]).map((row) => row.name);
    if (names.length === 0) break;
    const { error: removeError } = await db.storage.from("label-photos").remove(names);
    if (removeError)
      return new Response(`Falha ao remover fotos: ${removeError.message}`, { status: 500 });
    removed += names.length;
    if (names.length < BATCH) break;
  }
  return Response.json({ removed });
});
