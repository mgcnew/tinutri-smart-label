-- Aplicação manual no Supabase/Lovable. Não chama Asaas nem altera planos existentes.
-- Requer a Área Master (SQL 15).
begin;
alter table public.clients add column if not exists subscription_started_on date;
alter table public.clients add column if not exists subscription_status text not null default 'pendente'
 check (subscription_status in ('pendente','ativa','cancelada'));
create or replace function private.tinutri_subscription_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not private.tinutri_master(auth.uid()) and (new.subscription_started_on is not null or new.subscription_status<>'pendente') then
   raise exception 'Somente o Master pode gerenciar assinaturas.';
  end if;
 elsif (new.subscription_started_on is distinct from old.subscription_started_on or new.subscription_status is distinct from old.subscription_status)
   and not private.tinutri_master(auth.uid()) then
  raise exception 'Somente o Master pode gerenciar assinaturas.';
 end if;
 if new.subscription_status='ativa' and new.subscription_started_on is null then
  raise exception 'Informe a data de adesão.';
 end if;
 return new;
end; $$;
drop trigger if exists tinutri_subscription_guard on public.clients;
create trigger tinutri_subscription_guard before insert or update on public.clients
 for each row execute function private.tinutri_subscription_guard();

create table if not exists public.service_contracts (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 title text not null check (char_length(btrim(title)) between 3 and 160),
 body text not null check (char_length(btrim(body)) between 20 and 30000),
 status text not null default 'rascunho' check (status in ('rascunho','em_revisao','arquivada')),
 company_snapshot jsonb not null default '{}'::jsonb,
 plan_snapshot jsonb not null default '{}'::jsonb,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.service_contracts enable row level security;
revoke all on public.service_contracts from anon, authenticated;
grant select, insert, update on public.service_contracts to authenticated;
grant all on public.service_contracts to service_role;
drop policy if exists master_contracts on public.service_contracts;
create policy master_contracts on public.service_contracts for all to authenticated
 using (private.tinutri_master(auth.uid())) with check (private.tinutri_master(auth.uid()));
create index if not exists service_contracts_date_idx on public.service_contracts(created_at desc,id);
create index if not exists service_contracts_company_idx on public.service_contracts(client_id);
create or replace function private.tinutri_contract_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.clients; price integer; months integer;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito ao Master.'; end if;
 if tg_op='INSERT' then
  select * into strict c from public.clients where id=new.client_id;
  price=case c.plan when 'mensal' then 5990 when 'trimestral' then 5490 when 'anual' then 4990 end;
  months=case c.plan when 'mensal' then 1 when 'trimestral' then 3 when 'anual' then 12 end;
  if price is null then raise exception 'Selecione um plano atual no cadastro da empresa antes de criar a minuta.'; end if;
  new.company_snapshot=jsonb_build_object('name',c.name,'legal_name',c.legal_name,'cnpj',c.cnpj,'address',c.address,'city',c.city,'state',c.state,'responsible_name',c.responsible_name,'email',c.email,'phone',c.phone);
  new.plan_snapshot=jsonb_build_object('cycle',c.plan,'monthly_cents',price,'months',months,'total_cents',price*months,'started_on',c.subscription_started_on);
  new.created_by=auth.uid(); new.created_at=clock_timestamp();
 else
  if new.client_id<>old.client_id then raise exception 'Crie uma nova minuta para outra empresa.'; end if;
  new.company_snapshot=old.company_snapshot; new.plan_snapshot=old.plan_snapshot;
  new.created_by=old.created_by; new.created_at=old.created_at;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
drop trigger if exists tinutri_contract_guard on public.service_contracts;
create trigger tinutri_contract_guard before insert or update on public.service_contracts
 for each row execute function private.tinutri_contract_guard();
revoke all on function private.tinutri_subscription_guard(), private.tinutri_contract_guard() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
