import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ANA = "00000000-0000-4000-8000-000000000001";
const BIA = "00000000-0000-4000-8000-000000000002";

async function database() {
  const db = new PGlite();
  // Réplica mínima do Storage: buckets, objects com RLS e foldername.
  await db.exec(`create role authenticated; create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to authenticated;
    grant execute on function auth.uid(), storage.foldername(text) to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;`);
  const sql = await readFile("docs/sql/36-foto-do-usuario.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  return db;
}
const as = (db, user) =>
  db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
const put = (db, name) =>
  db.exec(`insert into storage.objects(bucket_id,name) values('avatars','${name}')`);

test("bucket de fotos é privado e aceita só imagens pequenas", async () => {
  const db = await database();
  const { rows } = await db.query("select * from storage.buckets where id='avatars'");
  assert.equal(rows[0].public, false);
  assert.equal(Number(rows[0].file_size_limit), 524288);
  assert.deepEqual(rows[0].allowed_mime_types, ["image/jpeg", "image/webp"]);
});

test("cada pessoa envia, vê, troca e remove só a própria foto", async () => {
  const db = await database();
  await as(db, ANA);
  await put(db, `${ANA}/avatar`);
  await assert.rejects(put(db, `${BIA}/avatar`));
  await assert.rejects(put(db, `${ANA}/outra.jpg`));
  const own = await db.query("select name from storage.objects");
  assert.deepEqual(
    own.rows.map((r) => r.name),
    [`${ANA}/avatar`],
  );
  await as(db, BIA);
  assert.equal((await db.query("select name from storage.objects")).rows.length, 0);
  assert.equal((await db.query("delete from storage.objects returning id")).rows.length, 0);
  await as(db, ANA);
  const updated = await db.query(
    `update storage.objects set name='${ANA}/avatar' where name='${ANA}/avatar' returning id`,
  );
  assert.equal(updated.rows.length, 1);
  assert.equal((await db.query("delete from storage.objects returning id")).rows.length, 1);
});
