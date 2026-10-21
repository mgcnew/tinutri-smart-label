import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contractingDb, MASTER, OTHER } from "./helpers/contracting-db.mjs";
async function setup() {
  const db = await contractingDb();
  const sql = await readFile(
    new URL("../docs/sql/25-fila-webhooks-asaas.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  await db.exec("set role service_role; set request.jwt.claim.role='service_role';");
  return db;
}
const enqueue = async (db, hash = "a".repeat(64)) =>
  (
    await db.query(
      "select enqueue_contract_webhook('evt_test','PAYMENT_RECEIVED','pay_test',null,$1) as j",
      [hash],
    )
  ).rows[0].j;
const claim = async (db, id, actor = null) =>
  (await db.query("select claim_contract_webhook($1,$2) as j", [id, actor])).rows[0].j;
test("fila deduplica evento e recusa conteúdo divergente sem apagar histórico", async () => {
  const db = await setup();
  try {
    const a = await enqueue(db);
    const b = await enqueue(db);
    assert.equal(a.id, b.id);
    assert.equal(
      (await db.query("select deliveries from contract_webhook_inbox")).rows[0].deliveries,
      2,
    );
    await assert.rejects(() => enqueue(db, "b".repeat(64)), /divergente/);
    assert.equal(
      (await db.query("select count(*)::int as n from contract_webhook_inbox")).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("reserva exclui execução concorrente, protege token e não repete concluída", async () => {
  const db = await setup();
  try {
    const row = await enqueue(db);
    const job = await claim(db, row.id);
    assert.equal(job.status, "processing");
    assert.equal(await claim(db, row.id, MASTER), null);
    await assert.rejects(
      () =>
        db.query("select finish_contract_webhook($1,$2,'completed','ignored')", [row.id, MASTER]),
      /substituída/,
    );
    await db.query("select finish_contract_webhook($1,$2,'completed','ignored')", [
      row.id,
      job.worker_token,
    ]);
    assert.equal((await enqueue(db)).status, "completed");
    assert.equal(await claim(db, row.id), null);
  } finally {
    await db.close();
  }
});
test("lease expirada é retomada sem permitir conclusão do worker anterior", async () => {
  const db = await setup();
  try {
    const row = await enqueue(db);
    const old = await claim(db, row.id);
    await db.query(
      "update contract_webhook_inbox set locked_until=now()-interval '1 minute' where id=$1",
      [row.id],
    );
    const current = await claim(db, row.id);
    assert.notEqual(current.worker_token, old.worker_token);
    await assert.rejects(
      () =>
        db.query("select finish_contract_webhook($1,$2,'completed','ignored')", [
          row.id,
          old.worker_token,
        ]),
      /substituída/,
    );
    await db.query("select finish_contract_webhook($1,$2,'completed','ignored')", [
      row.id,
      current.worker_token,
    ]);
  } finally {
    await db.close();
  }
});
test("retomada Master é auditada e trabalhador automático respeita backoff e bloqueio", async () => {
  const db = await setup();
  try {
    const row = await enqueue(db);
    const a = await claim(db, row.id);
    await db.query("select finish_contract_webhook($1,$2,'pending','retry')", [
      row.id,
      a.worker_token,
    ]);
    assert.equal(await claim(db, row.id), null);
    await assert.rejects(() => claim(db, row.id, OTHER), /Master/);
    const b = await claim(db, row.id, MASTER);
    assert.equal(b.last_retry_by, MASTER);
    await db.query("select finish_contract_webhook($1,$2,'blocked','payment_mismatch')", [
      row.id,
      b.worker_token,
    ]);
    assert.equal(await claim(db, row.id), null);
    assert.equal((await claim(db, row.id, MASTER)).attempts, 3);
  } finally {
    await db.close();
  }
});
test("falhas repetidas ficam bloqueadas para revisão em vez de repetir sem limite", async () => {
  const db = await setup();
  try {
    const row = await enqueue(db);
    await db.query("update contract_webhook_inbox set attempts=7 where id=$1", [row.id]);
    const job = await claim(db, row.id);
    await db.query("select finish_contract_webhook($1,$2,'pending','retry')", [
      row.id,
      job.worker_token,
    ]);
    assert.equal(
      (await db.query("select status from contract_webhook_inbox")).rows[0].status,
      "blocked",
    );
  } finally {
    await db.close();
  }
});
test("RLS limita leitura ao Master e RPCs/escrita ao servidor", async () => {
  const db = await setup();
  try {
    await enqueue(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${OTHER}';`);
    assert.equal(
      (await db.query("select count(*)::int as n from contract_webhook_inbox")).rows[0].n,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${MASTER}';`);
    assert.equal(
      (await db.query("select count(*)::int as n from contract_webhook_inbox")).rows[0].n,
      1,
    );
    await assert.rejects(() => enqueue(db), /permission/);
    await assert.rejects(
      () => db.query("update contract_webhook_inbox set status='completed'"),
      /permission/,
    );
    await db.exec("set role anon;");
    await assert.rejects(() => db.query("select * from contract_webhook_inbox"), /permission/);
  } finally {
    await db.close();
  }
});
