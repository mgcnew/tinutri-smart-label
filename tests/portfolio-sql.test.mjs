import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MASTER = "00000000-0000-4000-8000-000000000001";
const NUTRI = "00000000-0000-4000-8000-000000000002";
const OPERATOR = "00000000-0000-4000-8000-000000000003";
const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const C = "10000000-0000-4000-8000-00000000000c";

async function database() {
  const db = new PGlite();
  // Réplica mínima: tabelas, papéis, carteira e as funções de permissão usadas pelo SQL 31.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create type public.label_lifecycle as enum('ativa','utilizada','consumida','descartada','cancelada');
    create type public.label_kind as enum('manipulado','aberto','fracionado','recebido');
    create type public.print_status as enum('pendente','confirmada','falhou');
    create type public.client_status as enum('ativa','inativa','suspensa');
    create table public.clients(id uuid primary key, name text, status public.client_status default 'ativa', active boolean default true);
    create table public.user_roles(user_id uuid, role text);
    create table public.profiles(user_id uuid primary key, client_id uuid, name text, active boolean default true);
    create table public.nutritionist_clients(nutritionist_user_id uuid, client_id uuid);
    create table public.user_permissions(user_id uuid, permission text, granted boolean, updated_by uuid, updated_at timestamptz default now(), primary key(user_id, permission),
      constraint user_permissions_permission_check check (permission in ('gerir_produtos','gerir_colaboradores','gerir_impressoras','gerir_acessos','descartar','ver_historico')));
    create table public.activity_logs(user_id uuid, user_name text, client_id uuid, action text, entity_type text, entity_id uuid, metadata jsonb);
    create table public.products(id uuid primary key, client_id uuid, active boolean default true);
    create table public.collaborators(id uuid primary key, client_id uuid, active boolean default true);
    create table public.issued_labels(id uuid primary key default gen_random_uuid(), client_id uuid not null, product_id uuid, responsible_id uuid, issued_by uuid,
      product_name text, label_status public.label_lifecycle not null default 'ativa', label_kind public.label_kind not null default 'manipulado',
      print_status public.print_status not null default 'confirmada', issued_at timestamptz default now(), expires_at timestamptz, expires_on date,
      closed_at timestamptz, closed_reason text, lot_number text);
    create table public.label_events(id uuid primary key default gen_random_uuid(), client_id uuid, label_id uuid, event_type text, created_at timestamptz default now());
    create function private.role_rank(_user uuid) returns integer language sql stable security definer set search_path to 'public' as $$
      select coalesce(max(case role when 'admin_master' then 5 when 'nutricionista' then 4 when 'admin_cliente' then 3 when 'gerente' then 2 when 'operator' then 1 else 0 end), 0)
      from public.user_roles where user_id = _user$$;
    create function private.default_permission(_rank integer, _perm text) returns boolean language sql immutable as $$select false$$;
    create function private.is_admin_master(u uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.user_roles where user_id=u and role='admin_master')$$;
    create function private.has_permission(_user uuid, _perm text) returns boolean language sql stable security definer set search_path to 'public' as $$
      select case when private.is_admin_master(_user) then true else coalesce(
        (select granted from public.user_permissions where user_id=_user and permission=_perm),
        private.default_permission(private.role_rank(_user), _perm)) end$$;
    create function private.user_can_access_client(u uuid, c uuid) returns boolean language sql stable security definer as $$
      select private.is_admin_master(u) or exists(select 1 from public.profiles p where p.user_id=u and p.active and p.client_id=c)
        or exists(select 1 from public.nutritionist_clients n where n.nutritionist_user_id=u and n.client_id=c)$$;
    create function private.client_is_operational(c uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.clients where id=c and status='ativa')$$;
    create function private.assert_can_manage_member(u uuid) returns uuid language sql security definer as $$select client_id from public.profiles where user_id=u$$;
    create function public.my_permissions() returns jsonb language sql stable security definer as $$select '{}'::jsonb$$;
    create function public.set_member_permission(p_user uuid, p_permission text, p_granted boolean) returns void language sql as $$select$$;
    alter table public.issued_labels enable row level security;
    create policy "Users issue labels for accessible clients" on public.issued_labels for insert to authenticated with check (true);
    create policy "read labels" on public.issued_labels for select to authenticated using (private.user_can_access_client(auth.uid(), client_id));
    grant usage on schema public, auth, private to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant select, insert on public.issued_labels to authenticated;
    grant select on public.products, public.collaborators to authenticated;
    insert into public.clients(id,name,status) values ('${A}','Alfa','ativa'),('${B}','Beta','ativa'),('${C}','Gama','suspensa');
    insert into public.user_roles values ('${MASTER}','admin_master'),('${NUTRI}','nutricionista'),('${OPERATOR}','operator');
    insert into public.profiles values ('${MASTER}',null,'Master',true),('${NUTRI}',null,'Nutri',true),('${OPERATOR}','${A}','Operador',true);
    insert into public.nutritionist_clients values ('${NUTRI}','${A}'),('${NUTRI}','${C}');
    insert into public.products values ('20000000-0000-4000-8000-00000000000a','${A}',true);
    insert into public.collaborators values ('30000000-0000-4000-8000-00000000000a','${A}',true);`);
  const sql = await readFile(
    new URL("../docs/sql/31-painel-da-carteira.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  return db;
}
const as = (db, user) =>
  db.exec(
    `reset role; set request.jwt.claim.sub='${user}'; ${user ? "set role authenticated;" : "set role anon;"}`,
  );
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];

test("nutricionista não emite nem descarta por padrão; os demais perfis continuam iguais", async () => {
  const db = await database();
  try {
    const rows = (
      await db.query(
        "select r, p, private.default_permission(r, p) v from unnest(array[1,2,3,4,5]) r, unnest(array['emitir','descartar','ver_historico','gerir_produtos']) p order by r, p",
      )
    ).rows;
    const of = (rank, perm) => rows.find((x) => x.r === rank && x.p === perm).v;
    for (const rank of [1, 2, 3, 5]) {
      assert.equal(of(rank, "emitir"), true, `perfil ${rank} emite`);
      assert.equal(of(rank, "descartar"), true, `perfil ${rank} descarta`);
    }
    assert.equal(of(4, "emitir"), false);
    assert.equal(of(4, "descartar"), false);
    assert.equal(of(4, "ver_historico"), true);
    assert.equal(of(4, "gerir_produtos"), true);
    await db.query(
      "insert into public.user_permissions(user_id,permission,granted) values ($1,'emitir',true)",
      [NUTRI],
    );
    assert.equal((await one(db, "select private.has_permission($1,'emitir') v", [NUTRI])).v, true);
  } finally {
    await db.close();
  }
});

test("emissão exige a permissão também no banco", async () => {
  const db = await database();
  try {
    const insert = (user) =>
      db.query(
        `insert into public.issued_labels(client_id,product_id,responsible_id,issued_by,product_name,expires_on)
         values ($1,'20000000-0000-4000-8000-00000000000a','30000000-0000-4000-8000-00000000000a',$2,'Molho',current_date+2)`,
        [A, user],
      );
    await as(db, OPERATOR);
    await insert(OPERATOR);
    await db.exec("reset role;");
    await db.query(
      "insert into public.profiles(user_id,client_id,name) values ('00000000-0000-4000-8000-000000000004',$1,'Sem emissão')",
      [A],
    );
    await db.query(
      "insert into public.user_roles values ('00000000-0000-4000-8000-000000000004','operator')",
    );
    await db.query(
      "insert into public.user_permissions(user_id,permission,granted) values ('00000000-0000-4000-8000-000000000004','emitir',false)",
    );
    await as(db, "00000000-0000-4000-8000-000000000004");
    await assert.rejects(
      () => insert("00000000-0000-4000-8000-000000000004"),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test("indicadores da carteira contam vencidos, baixas, descarte, conferências e recebidos sem lote", async () => {
  const db = await database();
  try {
    await db.exec(`reset role;
      insert into public.issued_labels(client_id,product_name,label_status,expires_at,issued_at) values
        ('${A}','Molho','ativa',now()-interval '1 day',now()-interval '3 days'),
        ('${A}','Molho','ativa',now()+interval '1 day',now()-interval '2 days'),
        ('${A}','Arroz','ativa',now()+interval '10 days',now()-interval '1 day');
      insert into public.issued_labels(client_id,product_name,label_status,expires_at,issued_at,closed_at,closed_reason) values
        ('${A}','Molho','descartada',now()-interval '2 days',now()-interval '5 days',now()-interval '1 day','vencido'),
        ('${A}','Frango','descartada',now()+interval '2 days',now()-interval '5 days',now()-interval '1 day','temperatura'),
        ('${A}','Frango','descartada',now()+interval '2 days',now()-interval '5 days',now()-interval '2 days','temperatura'),
        ('${A}','Arroz','utilizada',now()+interval '2 days',now()-interval '5 days',now()-interval '1 day',null),
        ('${A}','Arroz','consumida',now()-interval '3 days',now()-interval '6 days',now()-interval '1 day',null);
      insert into public.issued_labels(client_id,product_name,label_kind,expires_at,issued_at) values ('${A}','Leite','recebido',now()+interval '5 days',now()-interval '1 day');
      insert into public.issued_labels(client_id,product_name,label_status,expires_at,issued_at) values ('${A}','Antigo','ativa',now()+interval '30 days',now()-interval '45 days');
      insert into public.label_events(client_id,event_type,created_at) values ('${A}','conferencia',now()-interval '1 day'),('${A}','conferencia',now()-interval '40 days'),('${A}','emissao',now());
      insert into public.issued_labels(client_id,product_name,expires_at) values ('${B}','Fora da carteira',now()-interval '1 day');`);
    await as(db, NUTRI);
    const rows = (await one(db, "select public.portfolio_health(30) j")).j;
    assert.deepEqual(
      rows.map((r) => r.name),
      ["Alfa", "Gama"],
    );
    const alfa = rows.find((r) => r.name === "Alfa");
    assert.equal(alfa.expired_open, 1);
    assert.equal(alfa.expiring_soon, 1);
    assert.equal(alfa.issued, 9);
    assert.equal(alfa.issued_prev, 1);
    assert.equal(alfa.settled, 5);
    assert.equal(alfa.discarded, 3);
    assert.equal(alfa.late_settled, 2);
    assert.equal(alfa.received_without_lot, 1);
    assert.equal(alfa.checks, 1);
    assert.equal(alfa.top_discard_reason, "temperatura");
    assert.deepEqual(alfa.top_products[0], { name: "Frango", count: 2 });
    const gama = rows.find((r) => r.name === "Gama");
    assert.equal(gama.status, "suspensa");
    assert.equal(gama.issued, 0);
    assert.equal(gama.last_issued_at, null);
    await as(db, MASTER);
    assert.equal((await one(db, "select jsonb_array_length(public.portfolio_health(30)) n")).n, 3);
  } finally {
    await db.close();
  }
});

test("painel é restrito à consultoria e ao período permitido", async () => {
  const db = await database();
  try {
    await as(db, OPERATOR);
    await assert.rejects(() => db.query("select public.portfolio_health(30)"), /restrito/);
    await as(db, NUTRI);
    await assert.rejects(() => db.query("select public.portfolio_health(400)"), /Período/);
    await as(db, "");
    await assert.rejects(() => db.query("select public.portfolio_health(30)"), /permission/);
  } finally {
    await db.close();
  }
});
