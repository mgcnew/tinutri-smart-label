import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MASTER = "00000000-0000-4000-8000-000000000001";
const CLIENT = "00000000-0000-4000-8000-000000000002";

async function database() {
  const db = new PGlite();
  // Réplica mínima: auth.users e a verificação de Master usada pelo SQL 33.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function private.tinutri_master(u uuid) returns boolean language sql stable security definer as $$select u='${MASTER}'::uuid$$;
    grant usage on schema public, auth, private to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${MASTER}'),('${CLIENT}');`);
  await db.exec(await readFile("docs/sql/33-dados-da-tinutri.sql", "utf8"));
  return db;
}
const as = (db, user) =>
  db.exec(
    `reset role; set request.jwt.claim.sub='${user}'; ${user ? "set role authenticated;" : "set role anon;"}`,
  );

test("Master grava e relê os dados da TiNutri em uma única linha", async () => {
  const db = await database();
  await as(db, MASTER);
  await db.exec(
    `insert into public.tinutri_profile(id, legal_name, cnpj, export_days) values (true, 'TiNutri Ltda', '00.000.000/0001-00', 30)
     on conflict (id) do update set legal_name=excluded.legal_name, cnpj=excluded.cnpj, export_days=excluded.export_days`,
  );
  await db.exec(
    `insert into public.tinutri_profile(id, legal_name) values (true, 'TiNutri Serviços')
     on conflict (id) do update set legal_name=excluded.legal_name`,
  );
  const { rows } = await db.query(
    "select legal_name, cnpj, export_days, updated_by from public.tinutri_profile",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legal_name, "TiNutri Serviços");
  assert.equal(rows[0].cnpj, "00.000.000/0001-00");
  assert.equal(rows[0].export_days, 30);
  assert.equal(rows[0].updated_by, MASTER);
  await assert.rejects(db.exec("insert into public.tinutri_profile(id) values (false)"));
  await assert.rejects(db.exec("update public.tinutri_profile set export_days = 0"));
});

test("quem não é Master não lê nem grava", async () => {
  const db = await database();
  await as(db, MASTER);
  await db.exec("insert into public.tinutri_profile(id, legal_name) values (true, 'TiNutri')");
  await as(db, CLIENT);
  const { rows } = await db.query("select * from public.tinutri_profile");
  assert.equal(rows.length, 0);
  await assert.rejects(
    db.exec("insert into public.tinutri_profile(id, legal_name) values (true, 'Outra')"),
  );
  const updated = await db.query(
    "update public.tinutri_profile set legal_name='Outra' returning 1",
  );
  assert.equal(updated.rows.length, 0);
  await as(db, "");
  await assert.rejects(db.query("select * from public.tinutri_profile"));
  await as(db, MASTER);
  await assert.rejects(db.exec("delete from public.tinutri_profile"));
});
