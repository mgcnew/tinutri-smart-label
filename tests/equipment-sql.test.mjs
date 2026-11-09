import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contractingDb, COMPANY, MASTER, OTHER } from "./helpers/contracting-db.mjs";

const read = (name) => readFile(new URL(`../docs/sql/${name}`, import.meta.url), "utf8");
async function database() {
  const db = await contractingDb({ activation: false });
  for (const name of ["34-valores-da-mensalidade.sql", "35-impressoras.sql"]) {
    const sql = await read(name);
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}
const as = (db, user) =>
  db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
const draft = async (db) =>
  (
    await db.query(
      `insert into service_contracts(client_id,title,body) values($1,'Contrato teste','MINUTA PARA REVISÃO — NÃO ASSINADA\nDocumento de teste.') returning id, equipment_snapshot`,
      [COMPANY],
    )
  ).rows[0];
const model = async (db, values = "'PDA X1',129000,3990,150000") =>
  (
    await db.query(
      `insert into equipment_models(name,sale_cents,loan_monthly_cents,replacement_cents) values(${values}) returning id`,
    )
  ).rows[0].id;
const choose = (db, set) => db.exec(`update clients set ${set} where id='${COMPANY}'`);

test("sem impressora, a minuta registra modalidade nenhum", async () => {
  const db = await database();
  await as(db, MASTER);
  assert.deepEqual((await draft(db)).equipment_snapshot, { mode: "nenhum" });
});

test("comodato entra na minuta com adicional mensal, quantidade e permanência", async () => {
  const db = await database();
  await as(db, MASTER);
  const id = await model(db);
  await choose(db, `equipment_mode='comodato', equipment_model_id='${id}', equipment_quantity=2`);
  const snap = (await draft(db)).equipment_snapshot;
  assert.equal(snap.mode, "comodato");
  assert.equal(snap.model, "PDA X1");
  assert.equal(snap.unit_cents, 3990);
  assert.equal(snap.total_cents, 7980);
  assert.equal(snap.replacement_cents, 150000);
  assert.equal(snap.min_months, 12);
  assert.equal(snap.negotiated, false);
});

test("venda usa o preço de venda, aceita valor negociado e não muda contratos gerados", async () => {
  const db = await database();
  await as(db, MASTER);
  const id = await model(db);
  await choose(db, `equipment_mode='venda', equipment_model_id='${id}'`);
  const first = await draft(db);
  assert.equal(first.equipment_snapshot.total_cents, 129000);
  assert.equal(first.equipment_snapshot.min_months, null);
  await db.exec(`update equipment_models set sale_cents=139000 where id='${id}'`);
  await choose(db, `equipment_custom_cents=119000`);
  const second = await draft(db);
  assert.equal(second.equipment_snapshot.unit_cents, 119000);
  assert.equal(second.equipment_snapshot.negotiated, true);
  await db.exec(`update service_contracts set title='Outro título' where id='${first.id}'`);
  const { rows } = await db.query(
    `select equipment_snapshot->>'total_cents' as total from service_contracts where id='${first.id}'`,
  );
  assert.equal(rows[0].total, "129000");
});

test("modalidade exige modelo ativo e valores válidos", async () => {
  const db = await database();
  await as(db, MASTER);
  await assert.rejects(choose(db, `equipment_mode='comodato'`));
  const id = await model(db);
  await db.exec(`update equipment_models set active=false where id='${id}'`);
  await assert.rejects(
    choose(db, `equipment_mode='venda', equipment_model_id='${id}'`),
    /modelo de impressora ativo/,
  );
  await assert.rejects(choose(db, `equipment_quantity=0`));
  await assert.rejects(choose(db, `equipment_min_months=61`));
  await assert.rejects(model(db, "'X',-1,0,0"));
});

test("quem não é Master lê o catálogo, mas não altera catálogo nem impressora da empresa", async () => {
  const db = await database();
  await as(db, MASTER);
  const id = await model(db);
  await as(db, OTHER);
  const { rows } = await db.query("select count(*)::int as n from equipment_models");
  assert.equal(rows[0].n, 1);
  await assert.rejects(model(db, "'Outra',1,1,1"));
  const updated = await db.query("update equipment_models set sale_cents=1 returning id");
  assert.equal(updated.rows.length, 0);
  await assert.rejects(
    choose(db, `equipment_mode='venda', equipment_model_id='${id}'`),
    /Somente o Master/,
  );
  await choose(db, `name='Outro nome'`);
});
