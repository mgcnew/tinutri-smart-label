import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const MASTER = "00000000-0000-4000-8000-000000000001";
export const OTHER = "00000000-0000-4000-8000-000000000002";
export const COMPANY = "10000000-0000-4000-8000-000000000001";
export async function contractingDb({ activation = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema storage;
    create table auth.users(id uuid primary key,email text unique,invited_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create function private.tinutri_master(u uuid) returns boolean language sql stable as $$select coalesce(u='${MASTER}'::uuid,false)$$;
    grant usage on schema public,auth,private to authenticated,service_role;
    grant execute on function private.tinutri_master(uuid),auth.uid(),auth.role() to authenticated,service_role;
    create type public.app_role as enum('admin','admin_master','admin_cliente','gerente','nutricionista','operator');
    create table clients(id uuid primary key,name text,legal_name text,cnpj text,address text,city text,state text,responsible_name text,email text,phone text,plan text,status text not null default 'inativa');
    create table profiles(user_id uuid primary key references auth.users(id),client_id uuid references clients(id),name text,email text);
    create table user_roles(user_id uuid references auth.users(id),role public.app_role,unique(user_id,role));
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    insert into auth.users(id,email) values('${MASTER}','master@example.com'),('${OTHER}','other@example.com');
    insert into clients(id,name,plan) values('${COMPANY}','Empresa teste','anual');
    grant select,insert,update on clients to authenticated;
    grant all on clients,profiles,user_roles to service_role;`);
  for (const name of [
    "19-assinaturas-contratos.sql",
    "22-contratacao-por-link.sql",
    ...(activation ? ["23-ativacao-contratacao.sql"] : []),
  ]) {
    const sql = await readFile(new URL(`../../docs/sql/${name}`, import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}
