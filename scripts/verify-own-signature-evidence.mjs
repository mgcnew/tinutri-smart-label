// Somente leitura: confere um contrato específico, sem exportar nomes/e-mails ou segredos.
import { loadEnvFile } from "node:process";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  canonicalEvidence,
  evidenceHmac,
  sha256,
} from "../src/lib/contracting/own-crypto.server.ts";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* ambiente hospedado */
}
if (!process.argv[2]) {
  console.log("Uso: npm run signature:evidence:verify -- UUID_DA_CONTRATACAO");
  process.exit(0);
}
try {
  const id = z.string().uuid().parse(process.argv[2]);
  const url = new URL(process.env.SUPABASE_URL || "");
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw Error("config");
  const db = createClient(url.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [document, offer, acceptances] = await Promise.all([
    db.from("contract_own_documents").select("*").eq("offer_id", id).single(),
    db
      .from("contract_offers")
      .select("signature_method,signature_status,signed_file_path")
      .eq("id", id)
      .single(),
    db.from("contract_own_acceptances").select("*").eq("offer_id", id).order("party"),
  ]);
  if (document.error || offer.error || acceptances.error || !document.data?.manifest)
    throw Error("document");
  const d = document.data;
  const expected = evidenceHmac(canonicalEvidence(d.manifest), d.manifest_key_id);
  const actual = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(d.manifest_hmac);
  const download = async (path) => {
    const r = await db.storage.from("contract-documents").download(path);
    if (r.error || !r.data || r.data.size > 20 * 1024 * 1024) throw Error("file");
    return new Uint8Array(await r.data.arrayBuffer());
  };
  const [original, final] = await Promise.all([download(d.original_path), download(d.final_path)]);
  const checks = {
    method: offer.data.signature_method === "tinutri" && offer.data.signature_status === "signed",
    manifest: timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex")),
    document: d.manifest.offer_id === id && d.manifest.original_sha256 === d.original_sha256,
    original_pdf: sha256(original) === d.original_sha256,
    final_pdf: sha256(final) === d.final_sha256 && d.final_path === offer.data.signed_file_path,
    acceptances:
      acceptances.data.length === 2 &&
      canonicalEvidence(d.manifest.acceptances) === canonicalEvidence(acceptances.data),
  };
  console.log(JSON.stringify({ checks, valid: Object.values(checks).every(Boolean) }, null, 2));
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
} catch {
  console.error(
    "Não foi possível validar o comprovante. Confira o UUID, a instalação SQL, o armazenamento e as versões das chaves. Nenhum dado pessoal ou segredo foi exibido.",
  );
  process.exitCode = 1;
}
