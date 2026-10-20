import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import {
  canActivate,
  commercialSchema,
  finalContractBody,
  offerStage,
  publishSchema,
  tokenSchema,
} from "../src/lib/contracting/domain.ts";
import { verifyClicksignHmac } from "../src/lib/contracting/webhook-auth.server.ts";
import { contractPdf } from "../src/lib/contracting/pdf.server.ts";
import { contractDraft, EMPTY_TERMS, contractPending } from "../src/lib/contract-template.ts";

const base = {
  revoked_at: null,
  expires_at: "2030-01-01T00:00:00Z",
  signature_status: "pending" as const,
  payment_status: "unconfigured" as const,
  activated_at: null,
};
const now = new Date("2026-10-20T12:00:00Z");
test("assinatura, pagamento e ativação são etapas independentes", () => {
  assert.equal(offerStage(base, now), "signature");
  assert.equal(offerStage({ ...base, payment_status: "confirmed" }, now), "signature");
  assert.equal(offerStage({ ...base, signature_status: "signed" }, now), "payment");
  assert.equal(
    offerStage({ ...base, signature_status: "signed", payment_status: "confirmed" }, now),
    "activation",
  );
  assert.equal(
    offerStage(
      {
        ...base,
        signature_status: "signed",
        payment_status: "confirmed",
        activated_at: now.toISOString(),
      },
      now,
    ),
    "active",
  );
  assert.equal(offerStage({ ...base, expires_at: now.toISOString() }, now), "expired");
  assert.equal(offerStage({ ...base, revoked_at: now.toISOString() }, now), "revoked");
});
test("sandbox, falta de PDF ou falta de pagamento nunca permitem ativação", () => {
  const ready = {
    revoked_at: null,
    signature_status: "signed" as const,
    payment_status: "confirmed" as const,
    signature_environment: "production" as const,
    signed_file_path: "signed.pdf",
    paid_at: now.toISOString(),
  };
  assert.equal(canActivate(ready), true);
  assert.equal(canActivate({ ...ready, signature_environment: "sandbox" }), false);
  assert.equal(canActivate({ ...ready, payment_status: "pending" }), false);
  assert.equal(canActivate({ ...ready, signed_file_path: null }), false);
  assert.equal(canActivate({ ...ready, paid_at: null }), false);
  assert.equal(canActivate({ ...ready, revoked_at: now.toISOString() }), false);
});
test("plano usa centavos, período coerente e total integral do ciclo", () => {
  const commercial = {
    start: "activation",
    payment: "pix",
    renewal: "manual",
    plan: { cycle: "anual", months: 12, monthly_cents: 4990, total_cents: 59880 },
  };
  assert.equal(commercialSchema.safeParse(commercial).success, true);
  for (const change of [
    { total_cents: 4990 },
    { months: 3 },
    { monthly_cents: 49.9 },
    { total_cents: -1 },
  ]) {
    assert.equal(
      commercialSchema.safeParse({ ...commercial, plan: { ...commercial.plan, ...change } })
        .success,
      false,
    );
  }
});
test("publicação requer revisão, representantes válidos e prazo limitado", () => {
  const input = {
    contractId: "00000000-0000-4000-8000-000000000001",
    updatedAt: now.toISOString(),
    signer: { name: "Cliente teste", email: "CLIENTE@example.com" },
    providerSigner: { name: "TiNutri teste", email: "tinutri@example.com" },
    accessContact: { name: "Acesso teste", email: "acesso@example.com" },
    expiresDays: 7,
    reviewed: true,
  };
  assert.equal(publishSchema.parse(input).signer.email, "cliente@example.com");
  for (const change of [
    { reviewed: false },
    { expiresDays: 0 },
    { expiresDays: 31 },
    { accessContact: { name: "X", email: "invalid" } },
  ])
    assert.equal(publishSchema.safeParse({ ...input, ...change }).success, false);
});
test("tokens usam 256 bits e rejeitam identificadores previsíveis", () => {
  assert.equal(tokenSchema.safeParse(randomBytes(32).toString("base64url")).success, true);
  for (const token of [
    "123",
    "00000000-0000-4000-8000-000000000001",
    "a".repeat(42),
    "a".repeat(44),
    "/".repeat(43),
  ])
    assert.equal(tokenSchema.safeParse(token).success, false);
});
test("o texto final preserva o documento e recusa pendências", () => {
  assert.equal(
    finalContractBody(
      "MINUTA PARA REVISÃO — NÃO ASSINADA\nContrato completo\n\nCondições acordadas.",
    ),
    "Contrato completo\n\nCondições acordadas.",
  );
  assert.throws(() => finalContractBody("Contrato com [PENDENTE: representante]."), /pendentes/);
});
test("webhook exige HMAC dos bytes originais e resiste a corpo alterado", () => {
  const raw = Buffer.from('{"event":"sign","nome":"João"}');
  const secret = "only-local-test-secret";
  const header = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyClicksignHmac(raw, header, secret), true);
  assert.equal(
    verifyClicksignHmac(Buffer.from('{ "event":"sign","nome":"João"}'), header, secret),
    false,
  );
  assert.equal(verifyClicksignHmac(raw, header, "other"), false);
  assert.equal(verifyClicksignHmac(raw, null, secret), false);
  assert.equal(verifyClicksignHmac(raw, "sha256=00", secret), false);
  assert.equal(verifyClicksignHmac(raw, header, ""), false);
});
test("contrato por link gera documento completo sem datas fictícias", () => {
  const company = {
    name: "Empresa de teste",
    legal_name: "Empresa de teste Ltda",
    cnpj: "00.000.000/0000-00",
    address: "Endereço de teste",
    city: "São Paulo",
    state: "SP",
    responsible_name: "Representante teste",
    email: "cliente@example.com",
    phone: "Telefone teste",
    plan: "anual",
  };
  const body = contractDraft(
    company,
    {
      ...EMPTY_TERMS,
      startOnActivation: true,
      payment: "pix",
      supportChannel: "suporte@example.com",
      supportHours: "Horário de teste",
      exportDays: "30",
    },
    {
      legalName: "Prestadora teste",
      cnpj: "00.000.000/0000-00",
      address: "Endereço de teste",
      representative: "Representante TiNutri",
      email: "tinutri@example.com",
      phone: "Telefone teste",
    },
  );
  assert.deepEqual(contractPending(body), []);
  assert.match(body, /na ativação do acesso/);
  assert.match(body, /conforme a cobrança disponibilizada/);
  assert.match(body, /registrada na conclusão das assinaturas/);
});
test("PDF pagina textos longos e preserva caracteres portugueses", async () => {
  const bytes = await contractPdf(
    "Contrato de licença — São Paulo",
    (
      "Condições de contratação: João, açúcar, utilização e segurança.\n\n" +
      "referência".repeat(100) +
      "\n"
    ).repeat(25),
  );
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() > 2);
});
test("PDF recusa caracteres que a fonte não consegue representar", async () => {
  await assert.rejects(() => contractPdf("Contrato", "Texto com emoji 🥗"));
});
