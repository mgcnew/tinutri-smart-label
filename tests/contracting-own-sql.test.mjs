import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { contractingDb, MASTER, OTHER, COMPANY } from "./helpers/contracting-db.mjs";
const hash = "a".repeat(64),
  context = "b".repeat(64),
  hmac = "c".repeat(64),
  origin = "d".repeat(64);
const commercial = {
  start: "activation",
  payment: "pix",
  renewal: "manual",
  plan: { cycle: "anual", months: 12, monthly_cents: 4990, total_cents: 59880 },
};
async function setup({ register = true } = {}) {
  const db = await contractingDb();
  for (const file of [
    "24-asaas-sandbox.sql",
    "25-fila-webhooks-asaas.sql",
    "26-assinatura-propria.sql",
  ]) {
    const sql = await readFile(new URL(`../docs/sql/${file}`, import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql);
  }
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${MASTER}';`);
  const c = (
    await db.query(
      "insert into service_contracts(client_id,title,body,commercial_snapshot) values($1,'Contrato teste','Texto completo para ensaio de assinatura.',$2) returning *",
      [COMPANY, commercial],
    )
  ).rows[0];
  const person = { name: "Cliente teste", email: "client@example.com" },
    owner = { name: "Master teste", email: "master@example.com" };
  const publish = (method = "tinutri", provider = owner) =>
    db.query("select publish_contract_offer($1,$2,$3,$4,$5,$6,$7,$8,7,'sandbox',$9) as id", [
      c.id,
      c.updated_at,
      context,
      c.body,
      hash,
      person,
      provider,
      person,
      method,
    ]);
  const id = (await publish()).rows[0].id;
  await db.exec("reset role;set role service_role;set request.jwt.claim.role='service_role';");
  if (register) await db.query("select register_own_contract_document($1,$2)", [id, hash]);
  return { db, id, publish };
}
async function issue(h, party = "client", ctx = context, actor = null) {
  const id = randomUUID();
  const r = (
    await h.db.query(
      "select issue_own_signature_code($1,$2,$3,$4,$5,$6,$7,'v1','encrypted-code',$8) as j",
      [id, h.id, party, ctx, actor, hash, hmac, origin],
    )
  ).rows[0].j;
  return { id, ...r };
}
const claim = async (h, id) =>
  (await h.db.query("select claim_own_signature_mail($1) as j", [id])).rows[0].j;
async function sent(h, id) {
  const m = await claim(h, id);
  assert.ok(m);
  await h.db.query("select finish_own_signature_mail($1,$2,true)", [id, m.worker_token]);
}
const confirm = async (h, id, code = hmac, ctx = context, actor = null) =>
  (await h.db.query("select confirm_own_signature($1,$2,$3,$4) as j", [id, ctx, code, actor]))
    .rows[0].j;
async function age(h, id) {
  await h.db.query(
    "update contract_own_challenges set created_at=now()-interval '2 minutes' where id=$1",
    [id],
  );
}
test("migração reaplicável congela método e PDF, mantém publicação antiga e valida Master", async () => {
  const h = await setup();
  try {
    assert.equal(
      (await h.db.query("select signature_method from contract_offers where id=$1", [h.id])).rows[0]
        .signature_method,
      "tinutri",
    );
    await assert.rejects(
      () =>
        h.db.query("update contract_offers set signature_method='clicksign' where id=$1", [h.id]),
      /imutável/,
    );
    await assert.rejects(
      () => h.db.query("update contract_offers set provider_signer_id='fake' where id=$1", [h.id]),
      /externo/,
    );
    await assert.rejects(
      () => h.db.query("select register_own_contract_document($1,$2)", [h.id, "e".repeat(64)]),
      /divergente/,
    );
    await assert.rejects(
      () =>
        h.db.query("update contract_own_documents set original_sha256=$2 where offer_id=$1", [
          h.id,
          "f".repeat(64),
        ]),
      /imutável/,
    );
    await h.db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${MASTER}';`);
    await assert.rejects(
      () => h.publish("tinutri", { name: "Outra pessoa", email: "other@example.com" }),
      /e-mail/,
    );
    assert.ok(
      (
        await h.db.query(
          "select to_regprocedure('public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text,text)') as f",
        )
      ).rows[0].f,
    );
  } finally {
    await h.db.close();
  }
});
test("código só confirma após SMTP, erros são persistidos e cinco tentativas bloqueiam", async () => {
  const h = await setup();
  try {
    const c = await issue(h);
    assert.equal(c.state, "queued");
    assert.equal((await confirm(h, c.id)).state, "invalid");
    await sent(h, c.id);
    assert.equal(
      (await h.db.query("select ciphertext from contract_own_mail_outbox")).rows[0].ciphertext,
      null,
    );
    for (let i = 0; i < 5; i++)
      assert.equal((await confirm(h, c.id, "e".repeat(64))).state, "invalid");
    assert.equal((await confirm(h, c.id)).state, "invalid");
    assert.equal(
      (await h.db.query("select attempts from contract_own_challenges")).rows[0].attempts,
      5,
    );
    assert.equal(
      (await h.db.query("select count(*)::int as n from contract_own_acceptances")).rows[0].n,
      0,
    );
  } finally {
    await h.db.close();
  }
});
test("reenvio invalida anterior; códigos não atravessam contexto, pessoa, expiração ou revogação", async () => {
  const h = await setup();
  try {
    const c = await issue(h);
    await sent(h, c.id);
    assert.equal((await issue(h)).state, "rate_limited");
    await age(h, c.id);
    const newer = await issue(h);
    await sent(h, newer.id);
    assert.equal((await confirm(h, c.id)).state, "invalid");
    assert.equal((await confirm(h, newer.id, hmac, "f".repeat(64))).state, "invalid");
    await h.db.query(
      "update contract_own_challenges set expires_at=now()-interval '1 second' where id=$1",
      [newer.id],
    );
    assert.equal((await confirm(h, newer.id)).state, "invalid");
    await age(h, newer.id);
    const third = await issue(h);
    await sent(h, third.id);
    await h.db.query("update contract_offers set token_hash=$2 where id=$1", [
      h.id,
      "e".repeat(64),
    ]);
    assert.equal((await confirm(h, third.id)).state, "invalid");
    await assert.rejects(() => issue(h, "tinutri", "f".repeat(64), OTHER), /representante/i);
    await h.db.query("update contract_offers set revoked_at=now() where id=$1", [h.id]);
    assert.equal((await confirm(h, third.id)).state, "invalid");
  } finally {
    await h.db.close();
  }
});
test("outbox reserva uma entrega e recupera falha sem duplicar desafios", async () => {
  const h = await setup();
  try {
    const c = await issue(h);
    const a = await claim(h, c.id);
    assert.ok(a.worker_token);
    assert.equal(await claim(h, c.id), null);
    await h.db.query("select finish_own_signature_mail($1,$2,false)", [c.id, a.worker_token]);
    assert.equal(await claim(h, c.id), null);
    await h.db.query(
      "update contract_own_mail_outbox set next_attempt_at=now()-interval '1 second' where challenge_id=$1",
      [c.id],
    );
    const b = await claim(h, c.id);
    assert.notEqual(a.worker_token, b.worker_token);
    await h.db.query("select finish_own_signature_mail($1,$2,true)", [c.id, a.worker_token]);
    assert.equal(
      (await h.db.query("select status from contract_own_mail_outbox")).rows[0].status,
      "sending",
    );
    await h.db.query("select finish_own_signature_mail($1,$2,true)", [c.id, b.worker_token]);
    assert.equal(await claim(h, c.id), null);
    assert.equal(
      (await h.db.query("select count(*)::int as n from contract_own_challenges")).rows[0].n,
      1,
    );
  } finally {
    await h.db.close();
  }
});
test("dois aceites atômicos finalizam uma vez e habilitam apenas pagamento sandbox verificado", async () => {
  const h = await setup();
  try {
    const c = await issue(h);
    await sent(h, c.id);
    assert.equal((await confirm(h, c.id)).state, "accepted");
    assert.equal((await confirm(h, c.id)).state, "accepted");
    const path = `${h.id}/signed/${hash}.pdf`,
      manifest = { offer_id: h.id, original_sha256: hash };
    const finalize = () =>
      h.db.query("select finish_own_contract_signature($1,$2,$3,$4,$5,'v1')", [
        h.id,
        path,
        hash,
        manifest,
        hmac,
      ]);
    await assert.rejects(finalize, /dois aceites/);
    assert.equal(
      (await h.db.query("select signature_status from contract_offers")).rows[0].signature_status,
      "awaiting",
    );
    const t = await issue(h, "tinutri", "f".repeat(64), MASTER);
    await sent(h, t.id);
    assert.equal((await confirm(h, t.id, hmac, "f".repeat(64), MASTER)).state, "accepted");
    await assert.rejects(
      () => h.db.query("update contract_own_acceptances set name='Alterado'"),
      /imutável/,
    );
    await finalize();
    await finalize();
    assert.equal(
      (await h.db.query("select count(*)::int as n from contract_signature_receipts")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await h.db.query(
          "select count(*)::int as n from contract_offer_events where kind='signature_completed'",
        )
      ).rows[0].n,
      1,
    );
    await h.db.query(
      "select record_verified_contract_payment($1,'sandbox-wallet','pay_test','evt_test',59880,'BRL','sandbox',now())",
      [h.id],
    );
    assert.equal(
      (await h.db.query("select count(*)::int as n from contract_activation_jobs")).rows[0].n,
      0,
    );
  } finally {
    await h.db.close();
  }
});
test("dados de desafios e comprovação são exclusivos do servidor", async () => {
  const h = await setup();
  try {
    const c = await issue(h);
    await h.db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${MASTER}';`);
    for (const table of [
      "contract_own_documents",
      "contract_own_challenges",
      "contract_own_acceptances",
      "contract_own_mail_outbox",
    ])
      await assert.rejects(() => h.db.query(`select * from ${table}`), /permission/);
    await assert.rejects(
      () => h.db.query("select confirm_own_signature($1,$2,$3,$4)", [c.id, context, hmac, MASTER]),
      /permission/,
    );
    await h.db.exec("reset role;set role anon;");
    await assert.rejects(() => h.db.query("select * from contract_own_challenges"), /permission/);
  } finally {
    await h.db.close();
  }
});

test("jornada integrada usa códigos reais, SQL e PDF final sem recibos fictícios ou usuário novo", async () => {
  const { requestOwnCode, finalizeOwnSignature } =
    await import("../src/lib/contracting/own-flow.server.ts");
  const { codeContext, codeHmac, sha256 } =
    await import("../src/lib/contracting/own-crypto.server.ts");
  const originalKeys = process.env.OWN_SIGNATURE_KEYS,
    originalId = process.env.OWN_SIGNATURE_KEY_ID;
  process.env.OWN_SIGNATURE_KEYS = JSON.stringify({
    v1: { otp: "1".repeat(64), mail: "2".repeat(64), evidence: "3".repeat(64) },
  });
  process.env.OWN_SIGNATURE_KEY_ID = "v1";
  const h = await setup({ register: false });
  try {
    const files = new Map(),
      delivered = new Map();
    const o = (await h.db.query("select * from contract_offers where id=$1", [h.id])).rows[0];
    const rpc = async (sql, params) => (await h.db.query(sql, params)).rows[0]?.j;
    const ports = {
      document: async () =>
        (await h.db.query("select * from contract_own_documents where offer_id=$1", [h.id]))
          .rows[0] ?? null,
      upload: async (path, pdf) => {
        files.set(path, pdf);
      },
      download: async (path) => files.get(path),
      register: (id, hash) => rpc("select register_own_contract_document($1,$2) as j", [id, hash]),
      issue: (p) =>
        rpc("select issue_own_signature_code($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as j", [
          p.id,
          p.offer,
          p.party,
          p.context,
          p.actor,
          p.hash,
          p.hmac,
          p.key,
          p.ciphertext,
          p.origin,
        ]),
      claimMail: (id) => rpc("select claim_own_signature_mail($1) as j", [id]),
      sendMail: async (c, code) => {
        delivered.set(c.challenge_id, { c, code });
      },
      finishMail: (id, token, sent) =>
        h.db.query("select finish_own_signature_mail($1,$2,$3)", [id, token, sent]),
      acceptances: async () =>
        (
          await h.db.query("select * from contract_own_acceptances where offer_id=$1", [h.id])
        ).rows.map((r) => ({ ...r, accepted_at: new Date(r.accepted_at).toISOString() })),
      finish: (id, path, hash, manifest, hmac, key) =>
        h.db.query("select finish_own_contract_signature($1,$2,$3,$4,$5,$6)", [
          id,
          path,
          hash,
          manifest,
          hmac,
          key,
        ]),
    };
    const submit = async (party, ctx, actor) => {
      assert.equal((await requestOwnCode(o, party, ctx, actor, origin, ports)).state, "sent");
      const entry = [...delivered.values()].find((x) => x.c.party === party);
      assert.ok(entry);
      const bound = codeContext({
        id: entry.c.challenge_id,
        offer: o.id,
        party,
        pdf: entry.c.original_sha256,
        context: ctx,
      });
      assert.equal(
        (
          await rpc("select confirm_own_signature($1,$2,$3,$4) as j", [
            entry.c.challenge_id,
            ctx,
            codeHmac(entry.code, bound, entry.c.key_id),
            actor,
          ])
        ).state,
        "accepted",
      );
    };
    await submit("client", o.token_hash, null);
    assert.equal((await finalizeOwnSignature(o, ports)).state, "waiting");
    await submit("tinutri", "f".repeat(64), MASTER);
    assert.equal((await finalizeOwnSignature(o, ports)).state, "signed");
    const doc = await ports.document();
    assert.equal(sha256(files.get(doc.final_path)), doc.final_sha256);
    assert.equal(
      (await h.db.query("select count(*)::int as n from contract_signature_receipts")).rows[0].n,
      0,
    );
    await h.db.exec("reset role;");
    assert.equal((await h.db.query("select count(*)::int as n from auth.users")).rows[0].n, 2);
    const ownSql = await readFile(
      new URL("../docs/sql/26-assinatura-propria.sql", import.meta.url),
      "utf8",
    );
    assert.match(ownSql, /Li o contrato e concordo com seus termos/);
  } finally {
    await h.db.close();
    if (originalKeys === undefined) delete process.env.OWN_SIGNATURE_KEYS;
    else process.env.OWN_SIGNATURE_KEYS = originalKeys;
    if (originalId === undefined) delete process.env.OWN_SIGNATURE_KEY_ID;
    else process.env.OWN_SIGNATURE_KEY_ID = originalId;
  }
});
