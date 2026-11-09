import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contractingDb, COMPANY, MASTER, OTHER } from "./helpers/contracting-db.mjs";

async function database() {
  const db = await contractingDb({ activation: false });
  const sql = await readFile(
    new URL("../docs/sql/34-valores-da-mensalidade.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  return db;
}
const as = (db, user) =>
  db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
const draft = (db) =>
  db.query(
    `insert into service_contracts(client_id,title,body) values($1,'Contrato teste','MINUTA PARA REVISÃO — NÃO ASSINADA\nDocumento de teste.') returning plan_snapshot`,
    [COMPANY],
  );

test("SQL 34 começa nos valores antigos e reaplicar não sobrescreve a tabela", async () => {
  const db = await database();
  await as(db, MASTER);
  await db.exec("update billing_prices set monthly_cents=5990 where cycle='anual'");
  const sql = await readFile(
    new URL("../docs/sql/34-valores-da-mensalidade.sql", import.meta.url),
    "utf8",
  );
  await db.exec("reset role");
  await db.exec(sql);
  const { rows } = await db.query(
    "select cycle, monthly_cents from billing_prices order by monthly_cents",
  );
  assert.deepEqual(
    rows.map((r) => [r.cycle, r.monthly_cents]),
    [
      ["trimestral", 5490],
      ["mensal", 5990],
      ["anual", 5990],
    ],
  );
});

test("minuta nova usa a tabela; contrato já gerado mantém o valor", async () => {
  const db = await database();
  await as(db, MASTER);
  const before = (await draft(db)).rows[0].plan_snapshot;
  assert.equal(before.monthly_cents, 4990);
  assert.equal(before.total_cents, 59880);
  await db.exec("update billing_prices set monthly_cents=5990 where cycle='anual'");
  const after = (await draft(db)).rows[0].plan_snapshot;
  assert.equal(after.monthly_cents, 5990);
  assert.equal(after.total_cents, 71880);
  const { rows } = await db.query(
    "select plan_snapshot->>'total_cents' as total from service_contracts order by created_at",
  );
  assert.deepEqual(
    rows.map((r) => r.total),
    ["59880", "71880"],
  );
});

test("valor negociado da empresa substitui a tabela e volta a ela quando apagado", async () => {
  const db = await database();
  await as(db, MASTER);
  await db.exec(`update clients set custom_monthly_cents=4500 where id='${COMPANY}'`);
  assert.equal((await draft(db)).rows[0].plan_snapshot.total_cents, 54000);
  await db.exec(`update clients set custom_monthly_cents=null where id='${COMPANY}'`);
  assert.equal((await draft(db)).rows[0].plan_snapshot.total_cents, 59880);
  await assert.rejects(db.exec(`update clients set custom_monthly_cents=0 where id='${COMPANY}'`));
});

test("quem não é Master lê a tabela, mas não altera preços nem o valor negociado", async () => {
  const db = await database();
  await as(db, OTHER);
  const { rows } = await db.query("select count(*)::int as n from billing_prices");
  assert.equal(rows[0].n, 3);
  const updated = await db.query("update billing_prices set monthly_cents=100 returning cycle");
  assert.equal(updated.rows.length, 0);
  await assert.rejects(
    db.exec("insert into billing_prices(cycle,monthly_cents) values ('mensal',100)"),
  );
  await assert.rejects(
    db.exec(`update clients set custom_monthly_cents=100 where id='${COMPANY}'`),
    /Somente o Master/,
  );
  await db.exec(`update clients set name='Outro nome' where id='${COMPANY}'`);
});
