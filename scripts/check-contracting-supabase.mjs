// Somente leitura: zero registros de clientes/usuários são solicitados.
import { loadEnvFile } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Variáveis da hospedagem têm prioridade. */
}
const report = {
  checked_at: new Date().toISOString(),
  checks: [],
  scope: "API metadata and empty reads; full SQL 99 permissions/RLS still require SQL Editor",
};
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
try {
  const base = new URL(process.env.SUPABASE_URL || "");
  if (
    base.protocol !== "https:" ||
    !base.hostname.endsWith(".supabase.co") ||
    base.username ||
    base.password ||
    !serverKey ||
    !publicKey
  )
    throw new Error("Configure URL e chaves do projeto no servidor antes de conferir.");
  const expected = process.env.VITE_SUPABASE_PROJECT_ID;
  if (expected && base.hostname.split(".")[0] !== expected)
    throw new Error("Projeto do servidor difere do frontend.");
  const headers = { apikey: serverKey, Authorization: `Bearer ${serverKey}` };
  const options = { signal: AbortSignal.timeout(15_000), redirect: "error" };
  const tables = [
    ["clients", "subscription_started_on,subscription_status"],
    ["service_contracts", "id,commercial_snapshot"],
    ["contract_offers", "id,signature_issue,signature_method"],
    ["contract_offer_events", "offer_id"],
    ["contract_signature_receipts", "offer_id"],
    ["contract_payment_confirmations", "offer_id"],
    ["contract_activation_jobs", "offer_id"],
    ["contract_payment_checkouts", "offer_id"],
    ["contract_webhook_inbox", "id,event_type,status,attempts"],
    ["contract_own_documents", "offer_id,original_sha256"],
    ["contract_own_challenges", "id"],
    ["contract_own_acceptances", "offer_id"],
    ["contract_own_mail_outbox", "challenge_id,status"],
  ];
  const checks = await Promise.all(
    tables.map(async ([table, columns]) => {
      const response = await fetch(`${base.origin}/rest/v1/${table}?select=${columns}&limit=0`, {
        ...options,
        headers,
      });
      await response.body?.cancel();
      return { resource: table, ok: response.ok, http_status: response.status };
    }),
  );
  report.checks.push(...checks);
  const bucketResponse = await fetch(`${base.origin}/storage/v1/bucket/contract-documents`, {
    ...options,
    headers,
  });
  const bucket = bucketResponse.ok ? await bucketResponse.json() : null;
  report.checks.push({
    resource: "private_pdf_bucket",
    ok: Boolean(
      bucket &&
      !bucket.public &&
      bucket.file_size_limit === 20971520 &&
      bucket.allowed_mime_types?.length === 1 &&
      bucket.allowed_mime_types[0] === "application/pdf",
    ),
  });
  const specs = await Promise.all([
    fetch(`${base.origin}/rest/v1/`, {
      ...options,
      headers: { ...headers, Accept: "application/openapi+json" },
    }),
    fetch(`${base.origin}/rest/v1/`, {
      ...options,
      headers: { apikey: publicKey, Accept: "application/openapi+json" },
    }),
  ]);
  if (!specs[0].ok) throw new Error("Não foi possível conferir os metadados de servidor.");
  const serviceSpec = await specs[0].json();
  let anonymousSpec = null;
  if (specs[1].ok) anonymousSpec = await specs[1].json();
  else if ([401, 403].includes(specs[1].status)) {
    const probe = await fetch(`${base.origin}/rest/v1/clients?select=id&limit=0`, {
      ...options,
      headers: { apikey: publicKey },
    });
    await probe.body?.cancel();
    if (!probe.ok) throw new Error("Não foi possível validar a chave pública do projeto.");
    console.log(
      "Metadados anônimos restritos pelo projeto. Permissões anônimas e autenticadas devem ser conferidas pelo SQL 99.",
    );
  } else throw new Error("Metadados anônimos indisponíveis.");
  const routines = [
    "complete_contract_signature",
    "interrupt_contract_signature",
    "record_verified_contract_payment",
    "queue_contract_activation",
    "claim_contract_activation",
    "contract_access_candidate",
    "remember_contract_access_user",
    "finish_contract_activation",
    "block_contract_activation",
    "claim_contract_checkout",
    "save_contract_checkout",
    "block_contract_checkout",
    "invalidate_sandbox_contract_payment",
    "enqueue_contract_webhook",
    "claim_contract_webhook",
    "finish_contract_webhook",
    "register_own_contract_document",
    "issue_own_signature_code",
    "claim_own_signature_mail",
    "finish_own_signature_mail",
    "confirm_own_signature",
    "finish_own_contract_signature",
    "expire_own_signature_codes",
  ];
  for (const name of routines) {
    const path = `/rpc/${name}`;
    report.checks.push({
      resource: name,
      ok: Boolean(serviceSpec.paths?.[path] && (!anonymousSpec || !anonymousSpec.paths?.[path])),
      evidence: anonymousSpec
        ? "service_role advertised; anonymous not advertised"
        : "service_role advertised; anonymous privilege check not available via metadata",
    });
  }
  for (const check of report.checks)
    console.log(`${check.ok ? "OK" : "REVISAR"}: ${check.resource}`);
  if (report.checks.some((check) => !check.ok)) process.exitCode = 1;
  console.log(
    "Consultas concluídas sem alteração ou exportação de registros. Os metadados não substituem a conferência completa de RLS e permissões do SQL 99.",
  );
} catch {
  console.error(
    "Não foi possível concluir a conferência. Confira a conexão e a configuração local, sem compartilhar segredos.",
  );
  process.exitCode = 1;
} finally {
  const directory = new URL("../integration-state.local/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL("supabase-contracting-check.json", directory),
    JSON.stringify(report, null, 2) + "\n",
  );
}
