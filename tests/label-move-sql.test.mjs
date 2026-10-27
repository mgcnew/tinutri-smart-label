import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const STAFF = "00000000-0000-4000-8000-000000000002";
const OUTSIDER = "00000000-0000-4000-8000-000000000003";
const NO_EMIT = "00000000-0000-4000-8000-000000000004";
const COMPANY = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const FROZEN = "f1f2f3f4f5f60718293a4b5c6d7e8f90";
const REFRIGERATED = "REFRIGERADO ≤ 5 °C";
const FREEZER = "CONGELADO ≤ -18 °C";
const AMBIENT = "TEMPERATURA AMBIENTE";

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create type public.label_lifecycle as enum('ativa','utilizada','consumida','descartada','cancelada');
    create type public.label_kind as enum('manipulado','aberto','fracionado','recebido');
    create type public.print_status as enum('preparada','confirmada','falha','cancelada');
    create table public.clients(id uuid primary key, name text, status text default 'ativa');
    create table public.profiles(user_id uuid primary key, client_id uuid, name text, email text, active boolean default true);
    create table public.products(id uuid primary key, client_id uuid, shelf_life_days integer not null, shelf_life_by_storage jsonb);
    create table public.issued_labels(id uuid primary key default gen_random_uuid(), client_id uuid not null, product_id uuid, responsible_id uuid,
      issued_by uuid not null, issued_by_user_id uuid, client_name text not null, product_name text not null, responsible_name text not null,
      lot_number text, inspection_label text, opened_on date not null, opened_at timestamptz, expires_on date not null, expires_at timestamptz,
      issued_at timestamptz not null default now(), quantity integer not null default 1,
      public_token text not null default md5(random()::text || clock_timestamp()::text) unique,
      label_status public.label_lifecycle not null default 'ativa', label_kind public.label_kind not null default 'aberto',
      storage_condition text, sector text, location text, closed_at timestamptz, closed_by uuid, closed_reason text,
      print_status public.print_status not null default 'preparada', confirmed_at timestamptz, confirmed_by uuid,
      reprint_count integer not null default 0, source_label_id uuid, allergens text[] not null default '{}', photo_path text,
      check (expires_on >= opened_on));
    create table public.label_events(id uuid primary key default gen_random_uuid(), label_id uuid not null, client_id uuid not null, event_type text not null,
      user_id uuid, user_name text, quantity integer not null default 1, metadata jsonb not null default '{}', created_at timestamptz not null default now());
    create function private.user_can_access_client(u uuid, c uuid) returns boolean language sql stable security definer as
      $$select exists(select 1 from public.profiles p where p.user_id=u and p.active and p.client_id=c)$$;
    create function private.has_permission(u uuid, perm text) returns boolean language sql stable security definer as $$select u <> '${NO_EMIT}'::uuid$$;
    create function private.client_is_operational(c uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.clients where id=c and status='ativa')$$;
    grant usage on schema public, auth, private to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into public.clients values ('${COMPANY}','Cozinha Teste','ativa');
    insert into public.profiles values ('${STAFF}','${COMPANY}','Ana','ana@example.com',true),
      ('${OUTSIDER}',null,'Fora','fora@example.com',true),('${NO_EMIT}','${COMPANY}','Sem emissão','x@example.com',true);
    insert into public.products values ('${PRODUCT}','${COMPANY}',3,'{"CONGELADO ≤ -18 °C": 30, "TEMPERATURA AMBIENTE": 0, "REFRIGERADO ≤ 5 °C": 2}');
    -- Refrigerada vencendo em 2 dias e congelada vencendo em 20 dias.
    insert into public.issued_labels(client_id,product_id,issued_by,client_name,product_name,responsible_name,opened_on,expires_on,expires_at,
      public_token,storage_condition,location,print_status,label_kind) values
      ('${COMPANY}','${PRODUCT}','${STAFF}','Cozinha Teste','Molho','Ana',current_date,current_date+2,now()+interval '2 days','${TOKEN}','${REFRIGERATED}','Geladeira 1','confirmada','manipulado'),
      ('${COMPANY}','${PRODUCT}','${STAFF}','Cozinha Teste','Carne','Ana',current_date,current_date+20,now()+interval '20 days','${FROZEN}','${FREEZER}','Freezer','confirmada','manipulado');`);
  for (const name of ["30-rastreabilidade-qr.sql", "32-mover-etiqueta.sql"]) {
    const sql = await readFile(new URL(`../docs/sql/${name}`, import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}
const as = (db, user) =>
  db.exec(
    `reset role; set request.jwt.claim.sub='${user}'; ${user ? "set role authenticated;" : "set role anon;"}`,
  );
const call = async (db, fn, ...args) =>
  (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) j`, args))
    .rows[0].j;
const hours = (iso) => (Date.parse(iso) - Date.now()) / 3_600_000;

test("regra A: congelar não estende a validade e descongelar encurta", async () => {
  const db = await database();
  try {
    await as(db, STAFF);
    const options = (await call(db, "label_lookup", TOKEN)).move_options;
    const freezer = options.find((o) => o.storage === FREEZER);
    const ambient = options.find((o) => o.storage === AMBIENT);
    assert.equal(freezer.days, 30);
    assert.ok(Math.abs(hours(freezer.expires_at) - 48) < 0.1, "congelar mantém os 2 dias atuais");
    assert.equal(ambient.allowed, false);
    assert.equal(
      options.some((o) => o.storage === REFRIGERATED),
      false,
      "a conservação atual não aparece",
    );

    const thaw = (await call(db, "label_lookup", FROZEN)).move_options.find(
      (o) => o.storage === REFRIGERATED,
    );
    assert.equal(thaw.days, 2);
    assert.ok(
      Math.abs(hours(thaw.expires_at) - 48) < 0.1,
      "descongelar passa a 2 dias, menos que os 20 atuais",
    );
    await assert.rejects(
      () => call(db, "move_label", TOKEN, AMBIENT),
      /não pode ficar nesta conservação/,
    );
  } finally {
    await db.close();
  }
});

test("nova etiqueta fica pendente; a original só é encerrada quando a impressão é confirmada", async () => {
  const db = await database();
  try {
    await as(db, STAFF);
    const created = await call(db, "move_label", FROZEN, REFRIGERATED);
    assert.equal(created.state, "created");
    assert.equal(created.label.print_status, "preparada");
    assert.equal(created.label.storage_condition, REFRIGERATED);
    assert.equal(created.label.location, "Freezer");
    assert.ok(Math.abs(hours(created.label.expires_at) - 48) < 0.1);
    // Antes da confirmação, a original continua valendo.
    assert.equal((await call(db, "label_lookup", FROZEN)).label.label_status, "ativa");
    // Repetir a mesma mudança reaproveita a pendente.
    const again = await call(db, "move_label", FROZEN, REFRIGERATED);
    assert.equal(again.state, "pending");
    assert.equal(again.label.id, created.label.id);

    assert.equal((await call(db, "finish_label_move", created.label.public_token)).state, "done");
    assert.equal((await call(db, "finish_label_move", created.label.public_token)).state, "done");
    const original = await call(db, "label_lookup", FROZEN);
    assert.equal(original.label.label_status, "cancelada");
    assert.equal(original.replaced_by_token, created.label.public_token);
    assert.deepEqual(original.move_options, []);
    assert.ok(original.events.some((e) => e.type === "substituida"));
    const replacement = await call(db, "label_lookup", created.label.public_token);
    assert.equal(replacement.source_token, FROZEN);
    assert.equal(replacement.label.print_status, "confirmada");
    assert.deepEqual(replacement.events.map((e) => e.type).sort(), [
      "emissao",
      "impressao_confirmada",
    ]);
    await assert.rejects(() => call(db, "move_label", FROZEN, REFRIGERATED), /ativas e impressas/);
  } finally {
    await db.close();
  }
});

test("trocar de ideia cancela a pendente anterior; visitante vê os marcos sem nomes", async () => {
  const db = await database();
  try {
    await as(db, STAFF);
    const first = await call(db, "move_label", FROZEN, REFRIGERATED);
    const second = await call(db, "move_label", FROZEN, "RESFRIADO 6 °C A 10 °C");
    assert.equal(second.state, "created");
    assert.notEqual(second.label.id, first.label.id);
    assert.equal(
      (await call(db, "label_lookup", first.label.public_token)).label.label_status,
      "cancelada",
    );
    await assert.rejects(
      () => call(db, "finish_label_move", first.label.public_token),
      /cancelada/,
    );
    await as(db, "");
    const visitor = await call(db, "label_lookup", FROZEN);
    assert.equal(visitor.staff, false);
    assert.deepEqual(visitor.move_options, []);
    assert.ok(visitor.events.some((e) => e.type === "mudanca_conservacao" && e.by === null));
  } finally {
    await db.close();
  }
});

test("mudança de local registra de onde para onde, sem gerar etiqueta", async () => {
  const db = await database();
  try {
    await as(db, STAFF);
    assert.equal(
      (await call(db, "update_label_location", TOKEN, "  Geladeira 2  ")).state,
      "moved",
    );
    assert.equal((await call(db, "update_label_location", TOKEN, "Geladeira 2")).state, "same");
    const lookup = await call(db, "label_lookup", TOKEN);
    assert.equal(lookup.label.location, "Geladeira 2");
    assert.ok(lookup.events.some((e) => e.type === "movimentacao" && e.by === "Ana"));
    await assert.rejects(() => call(db, "update_label_location", TOKEN, " "), /novo local/);
    await db.exec("reset role;");
    assert.equal((await db.query("select count(*)::int n from public.issued_labels")).rows[0].n, 2);
  } finally {
    await db.close();
  }
});

test("exige acesso à empresa, permissão de emitir para mudar conservação e login", async () => {
  const db = await database();
  try {
    await as(db, OUTSIDER);
    await assert.rejects(() => call(db, "update_label_location", TOKEN, "X"), /Sem acesso/);
    await assert.rejects(() => call(db, "move_label", TOKEN, FREEZER), /Sem acesso/);
    await as(db, NO_EMIT);
    await assert.rejects(() => call(db, "move_label", TOKEN, FREEZER), /permissão para emitir/);
    assert.equal((await call(db, "update_label_location", TOKEN, "Geladeira 3")).state, "moved");
    await as(db, "");
    await assert.rejects(() => call(db, "move_label", TOKEN, FREEZER), /permission/);
    await assert.rejects(() => call(db, "update_label_location", TOKEN, "X"), /permission/);
  } finally {
    await db.close();
  }
});
