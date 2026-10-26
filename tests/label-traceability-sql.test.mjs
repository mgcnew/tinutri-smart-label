import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MASTER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";
const COMPANY = "10000000-0000-4000-8000-000000000001";
const ELSEWHERE = "10000000-0000-4000-8000-000000000002";
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const CLOSED = "ffffeeeeddddccccbbbbaaaa99998888";

async function database() {
  const db = new PGlite();
  // Réplica mínima das tabelas e regras de acesso usadas pelas duas funções.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create type public.label_lifecycle as enum('ativa','utilizada','consumida','descartada','cancelada');
    create type public.label_kind as enum('manipulado','aberto','fracionado','recebido');
    create table public.clients(id uuid primary key, name text not null);
    create table public.profiles(user_id uuid primary key, client_id uuid, name text, email text, active boolean default true);
    create table public.issued_labels(id uuid primary key default gen_random_uuid(), client_id uuid not null, public_token text unique,
      product_name text, sector text, location text, opened_at timestamptz, opened_on date, expires_at timestamptz, expires_on date,
      storage_condition text, lot_number text, inspection_label text, responsible_name text,
      label_status public.label_lifecycle not null default 'ativa', label_kind public.label_kind not null default 'manipulado',
      issued_at timestamptz default now(), allergens text[]);
    create table public.label_events(id uuid primary key default gen_random_uuid(), label_id uuid not null references public.issued_labels(id),
      client_id uuid not null, event_type text not null, user_id uuid, user_name text, quantity integer not null default 1,
      metadata jsonb not null default '{}', created_at timestamptz not null default now());
    create function private.user_can_access_client(u uuid, c uuid) returns boolean language sql stable security definer as
      $$select coalesce(u='${MASTER}'::uuid or exists(select 1 from public.profiles p where p.user_id=u and p.active and p.client_id=c), false)$$;
    grant usage on schema public, auth, private to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into public.clients values ('${COMPANY}','Cozinha Teste'),('${ELSEWHERE}','Outra Empresa');
    insert into public.profiles values ('${STAFF}','${COMPANY}','Ana Operadora','ana@example.com',true),('${OTHER}','${ELSEWHERE}','Beto','beto@example.com',true);
    insert into public.issued_labels(client_id,public_token,product_name,expires_on,opened_on,responsible_name,allergens)
      values ('${COMPANY}','${TOKEN}','Molho de tomate',current_date+3,current_date,'Ana',array['leite','glúten']);
    insert into public.issued_labels(client_id,public_token,product_name,expires_on,opened_on,responsible_name,label_status)
      values ('${COMPANY}','${CLOSED}','Arroz',current_date+1,current_date,'Ana','descartada');
    insert into public.label_events(label_id,client_id,event_type,user_id,user_name,created_at)
      select id,client_id,'emissao','${STAFF}','Ana Operadora',now()-interval '2 hours' from public.issued_labels where public_token='${TOKEN}';
    insert into public.label_events(label_id,client_id,event_type,user_id,user_name,created_at)
      select id,client_id,'falha_impressao','${STAFF}','Ana Operadora',now()-interval '1 hour' from public.issued_labels where public_token='${TOKEN}';`);
  const sql = await readFile(
    new URL("../docs/sql/30-rastreabilidade-qr.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  return db;
}
const as = async (db, role, user = "") =>
  db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role ${role};`);
const lookup = async (db, token = TOKEN) =>
  (await db.query("select public.label_lookup($1) as j", [token])).rows[0].j;
const check = async (db, token = TOKEN) =>
  (await db.query("select public.register_label_check($1) as j", [token])).rows[0].j;

test("visitante vê alérgenos e só os marcos da linha do tempo, sem nomes", async () => {
  const db = await database();
  try {
    await as(db, "anon");
    const result = await lookup(db);
    assert.equal(result.staff, false);
    assert.deepEqual(result.label.allergens, ["leite", "glúten"]);
    assert.equal(result.label.client_name, "Cozinha Teste");
    assert.deepEqual(
      result.events.map((e) => e.type),
      ["emissao"],
    );
    assert.equal(result.events[0].by, null);
    assert.equal(await lookup(db, "nao-existe-0000"), null);
    assert.equal(await lookup(db, "curto"), null);
  } finally {
    await db.close();
  }
});

test("equipe da empresa vê todos os eventos e quem fez; outra empresa é tratada como visitante", async () => {
  const db = await database();
  try {
    await as(db, "authenticated", STAFF);
    const staff = await lookup(db);
    assert.equal(staff.staff, true);
    assert.deepEqual(
      staff.events.map((e) => e.type),
      ["falha_impressao", "emissao"],
    );
    assert.equal(staff.events[1].by, "Ana Operadora");
    await as(db, "authenticated", OTHER);
    const other = await lookup(db);
    assert.equal(other.staff, false);
    assert.equal(other.events[0].by, null);
  } finally {
    await db.close();
  }
});

test("conferência é registrada uma vez a cada 10 minutos e aparece para visitantes sem o nome", async () => {
  const db = await database();
  try {
    await as(db, "authenticated", STAFF);
    assert.equal((await check(db)).state, "registered");
    assert.equal((await check(db)).state, "recent");
    await as(db, "authenticated", MASTER);
    assert.equal((await check(db)).state, "registered");
    await as(db, "authenticated", STAFF);
    const staff = await lookup(db);
    assert.equal(staff.events.filter((e) => e.type === "conferencia").length, 2);
    assert.ok(staff.events.some((e) => e.type === "conferencia" && e.by === "Ana Operadora"));
    await db.exec("reset role;");
    await db.exec(
      "update public.label_events set created_at=now()-interval '11 minutes' where event_type='conferencia'",
    );
    await as(db, "authenticated", STAFF);
    assert.equal((await check(db)).state, "registered");
    await as(db, "anon");
    const visitor = await lookup(db);
    assert.equal(visitor.events.filter((e) => e.type === "conferencia").length, 3);
    assert.ok(visitor.events.every((e) => e.by === null));
  } finally {
    await db.close();
  }
});

test("conferência exige login e acesso, e não é registrada em etiqueta baixada", async () => {
  const db = await database();
  try {
    await as(db, "authenticated", OTHER);
    await assert.rejects(() => check(db), /Sem acesso/);
    await as(db, "authenticated", STAFF);
    assert.equal((await check(db, CLOSED)).state, "closed");
    await assert.rejects(() => check(db, "nao-existe-0000"), /não encontrada/);
    await as(db, "anon");
    await assert.rejects(() => check(db), /permission/);
    await db.exec("reset role;");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.label_events where event_type='conferencia'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
