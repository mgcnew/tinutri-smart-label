import test from "node:test";
import assert from "node:assert/strict";
import { contractingDb } from "./helpers/contracting-db.mjs";

const master = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const company = "10000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const person = { name: "Representante teste", email: "cliente@example.com" };
const provider = { name: "TiNutri teste", email: "tinutri@example.com" };
const commercial = {
  start: "activation",
  payment: "pix",
  renewal: "manual",
  plan: { cycle: "anual", monthly_cents: 4990, months: 12, total_cents: 59880 },
};

test("SQL de contratação: migração reaplicável, RLS, imutabilidade e confirmação com dois representantes", async () => {
  const db = await contractingDb();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${master}';`);
    const draft = (
      await db.query(
        `insert into service_contracts(client_id,title,body,status,commercial_snapshot) values($1,'Contrato teste','MINUTA PARA REVISÃO — NÃO ASSINADA\nDocumento de teste completo para assinatura.','em_revisao',$2) returning *`,
        [company, commercial],
      )
    ).rows[0];
    const publish = (override = {}) =>
      db.query(`select publish_contract_offer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id`, [
        override.contract ?? draft.id,
        override.updated ?? draft.updated_at,
        override.token ?? hash,
        override.body ?? "Documento de teste completo para assinatura.",
        hash,
        person,
        provider,
        person,
        override.days ?? 7,
        "sandbox",
      ]);
    await assert.rejects(() => publish({ days: 31 }), /Prazo/);
    await assert.rejects(() => publish({ updated: "2000-01-01T00:00:00Z" }), /mudou/);
    await assert.rejects(
      () => publish({ body: "Contrato divergente para publicação indevida." }),
      /divergente/,
    );
    const id = (await publish()).rows[0].id;
    await assert.rejects(() => publish({ token: "b".repeat(64) }), /unique/i);
    assert.equal((await db.query("select * from contract_offers")).rows.length, 1);
    const secondDraft = (
      await db.query(
        "insert into service_contracts(client_id,title,body,commercial_snapshot) values($1,'Outra minuta','Documento de teste completo para assinatura.',$2) returning *",
        [company, commercial],
      )
    ).rows[0];
    await assert.rejects(
      () =>
        publish({
          contract: secondDraft.id,
          updated: secondDraft.updated_at,
          token: "f".repeat(64),
        }),
      /unique/i,
    );

    await assert.rejects(
      () => db.query("update contract_offers set payment_status='confirmed' where id=$1", [id]),
      /permission/i,
    );
    await assert.rejects(
      () => db.query("select complete_contract_signature($1,$2,$3)", [id, "fake.pdf", hash]),
      /permission/i,
    );
    await db.exec(`update clients set name='Nome novo',plan='mensal';`);
    assert.equal(
      (await db.query("select commercial from contract_offers")).rows[0].commercial.plan
        .total_cents,
      59880,
    );
    await db.query("select rotate_contract_offer($1,$2)", [id, "c".repeat(64)]);
    assert.equal(
      (await db.query("select token_hash from contract_offers")).rows[0].token_hash,
      "c".repeat(64),
    );
    await db.exec(`set request.jwt.claim.sub='${other}';`);
    assert.equal((await db.query("select * from contract_offers")).rows.length, 0);
    assert.equal((await db.query("select * from contract_offer_events")).rows.length, 0);
    await assert.rejects(() => publish(), /Master/);
    await assert.rejects(
      () => db.query("select rotate_contract_offer($1,$2)", [id, hash]),
      /Master/,
    );
    await db.exec("reset role; set role anon;");
    await assert.rejects(() => db.query("select * from contract_offers"), /permission/i);
    await assert.rejects(
      () => db.query("select * from contract_signature_receipts"),
      /permission/i,
    );
    await db.exec("reset role;");
    await assert.rejects(
      () => db.query("update contract_offers set body='Documento alterado' where id=$1", [id]),
      /imutável/,
    );
    await assert.rejects(
      () => db.query("update contract_offers set activated_at=now() where id=$1", [id]),
      /check constraint/i,
    );
    await db.query(
      "update contract_offers set provider_document_id='doc',provider_signer_id='signer-a',provider_company_signer_id='signer-b',signature_status='awaiting' where id=$1",
      [id],
    );
    const path = `${id}/signed/${hash}.pdf`;
    await assert.rejects(
      () => db.query("select complete_contract_signature($1,$2,$3)", [id, path, hash]),
      /duas/,
    );
    await db.query(
      "insert into contract_signature_receipts(offer_id,signer_id,event_sha256) values($1,'signer-a',$2)",
      [id, "d".repeat(64)],
    );
    await assert.rejects(
      () => db.query("select complete_contract_signature($1,$2,$3)", [id, path, hash]),
      /duas/,
    );
    await db.query(
      "insert into contract_signature_receipts(offer_id,signer_id,event_sha256) values($1,'signer-b',$2)",
      [id, "e".repeat(64)],
    );
    await assert.rejects(
      () =>
        db.query("select complete_contract_signature($1,$2,$3)", [id, "another-offer.pdf", hash]),
      /Arquivo/,
    );
    await db.query("select complete_contract_signature($1,$2,$3)", [id, path, hash]);
    await db.query("select complete_contract_signature($1,$2,$3)", [id, path, hash]);
    const signed = (await db.query("select * from contract_offers where id=$1", [id])).rows[0];
    assert.equal(signed.signature_status, "signed");
    assert.equal(signed.payment_status, "unconfigured");
    assert.equal(signed.activated_at, null);
    assert.equal(
      (await db.query("select * from contract_offer_events where kind='signature_completed'")).rows
        .length,
      1,
    );
    await assert.rejects(
      () => db.query("update contract_offers set signature_status='awaiting' where id=$1", [id]),
      /regredir/,
    );
    await assert.rejects(
      () =>
        db.query("update contract_offers set signature_environment='production' where id=$1", [id]),
      /imutável/,
    );
    await db.query(
      "update contract_offers set payment_status='confirmed',payment_provider_id='sandbox-payment',paid_at=now() where id=$1",
      [id],
    );
    await assert.rejects(
      () => db.query("update contract_offers set activated_at=now() where id=$1", [id]),
      /check constraint/i,
    );
    await db.query("update contract_offers set revoked_at=now() where id=$1", [id]);
    await assert.rejects(
      () => db.query("update contract_offers set token_hash=$2 where id=$1", [id, hash]),
      /revogada/,
    );
    assert.equal(
      (await db.query("select public from storage.buckets where id='contract-documents'")).rows[0]
        .public,
      false,
    );
  } finally {
    await db.close();
  }
});
