-- Aplicação manual depois do 34. Impressora vendida junto do plano, em comodato ou venda única (Fase 1).
-- 1) equipment_models: catálogo de impressoras com preço de venda, adicional mensal de comodato (por unidade)
--    e valor de reposição. Qualquer usuário autenticado lê; só o Master cadastra e altera. Sem exclusão:
--    um modelo que sai de linha é desativado.
-- 2) clients.equipment_*: modalidade (nenhum, comodato, venda), modelo, quantidade, valor negociado opcional
--    (mensal no comodato, por unidade na venda) e permanência mínima do comodato (padrão 12 meses).
--    Só o Master altera.
-- 3) service_contracts.equipment_snapshot: o aparelho e os valores entram na minuta quando ela é criada,
--    como o plan_snapshot. Contratos já gerados não mudam.
-- O aparelho é cobrado em cobrança própria, separada da assinatura; a cobrança online e a ativação não mudam.
-- Não apaga dados.
begin;

create table if not exists public.equipment_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 120),
  sale_cents integer not null check (sale_cents between 0 and 100000000),
  loan_monthly_cents integer not null check (loan_monthly_cents between 0 and 10000000),
  replacement_cents integer not null check (replacement_cents between 0 and 100000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists equipment_models_updated_by_fk_idx on public.equipment_models(updated_by);

alter table public.equipment_models enable row level security;
drop policy if exists read_equipment_models on public.equipment_models;
create policy read_equipment_models on public.equipment_models for select to authenticated using (true);
drop policy if exists master_insert_equipment_models on public.equipment_models;
create policy master_insert_equipment_models on public.equipment_models for insert to authenticated
  with check (private.tinutri_master((select auth.uid())));
drop policy if exists master_update_equipment_models on public.equipment_models;
create policy master_update_equipment_models on public.equipment_models for update to authenticated
  using (private.tinutri_master((select auth.uid())))
  with check (private.tinutri_master((select auth.uid())));
revoke all on public.equipment_models from anon, authenticated;
grant select on public.equipment_models to authenticated;
grant insert (name, sale_cents, loan_monthly_cents, replacement_cents, active),
  update (name, sale_cents, loan_monthly_cents, replacement_cents, active)
  on public.equipment_models to authenticated;

create or replace function private.touch_equipment_models() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then new.created_at := now(); end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists touch_equipment_models on public.equipment_models;
create trigger touch_equipment_models before insert or update on public.equipment_models
  for each row execute function private.touch_equipment_models();

alter table public.clients add column if not exists equipment_mode text not null default 'nenhum'
  check (equipment_mode in ('nenhum','comodato','venda'));
alter table public.clients add column if not exists equipment_model_id uuid
  references public.equipment_models(id);
alter table public.clients add column if not exists equipment_quantity smallint not null default 1
  check (equipment_quantity between 1 and 50);
alter table public.clients add column if not exists equipment_custom_cents integer
  check (equipment_custom_cents between 0 and 100000000);
alter table public.clients add column if not exists equipment_min_months smallint not null default 12
  check (equipment_min_months between 0 and 60);
alter table public.clients drop constraint if exists clients_equipment_model_required;
alter table public.clients add constraint clients_equipment_model_required
  check (equipment_mode='nenhum' or equipment_model_id is not null);
create index if not exists clients_equipment_model_fk_idx on public.clients(equipment_model_id);

create or replace function private.tinutri_equipment_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and (new.equipment_mode<>'nenhum' or new.equipment_model_id is not null
      or new.equipment_custom_cents is not null)
     or tg_op='UPDATE' and (new.equipment_mode is distinct from old.equipment_mode
      or new.equipment_model_id is distinct from old.equipment_model_id
      or new.equipment_quantity is distinct from old.equipment_quantity
      or new.equipment_custom_cents is distinct from old.equipment_custom_cents
      or new.equipment_min_months is distinct from old.equipment_min_months) then
    if not private.tinutri_master(auth.uid()) then
      raise exception 'Somente o Master pode definir a impressora da assinatura.';
    end if;
    if new.equipment_model_id is not null
       and (tg_op='INSERT' or new.equipment_model_id is distinct from old.equipment_model_id)
       and not exists(select 1 from public.equipment_models m where m.id=new.equipment_model_id and m.active) then
      raise exception 'Escolha um modelo de impressora ativo.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists tinutri_equipment_guard on public.clients;
create trigger tinutri_equipment_guard before insert or update on public.clients
  for each row execute function private.tinutri_equipment_guard();

alter table public.service_contracts add column if not exists equipment_snapshot jsonb not null
  default '{"mode":"nenhum"}'::jsonb;

-- Mesmo guard do SQL 34, agora também com o aparelho.
create or replace function private.tinutri_contract_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.clients; m public.equipment_models; price integer; months integer; unit integer;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito ao Master.'; end if;
 if tg_op='INSERT' then
  select * into strict c from public.clients where id=new.client_id;
  months=case c.plan when 'mensal' then 1 when 'trimestral' then 3 when 'anual' then 12 end;
  if months is not null then
   price=coalesce(c.custom_monthly_cents,(select p.monthly_cents from public.billing_prices p where p.cycle=c.plan));
  end if;
  if price is null then raise exception 'Selecione um plano atual no cadastro da empresa antes de criar a minuta.'; end if;
  new.company_snapshot=jsonb_build_object('name',c.name,'legal_name',c.legal_name,'cnpj',c.cnpj,'address',c.address,'city',c.city,'state',c.state,'responsible_name',c.responsible_name,'email',c.email,'phone',c.phone);
  new.plan_snapshot=jsonb_build_object('cycle',c.plan,'monthly_cents',price,'months',months,'total_cents',price*months,'started_on',c.subscription_started_on);
  if c.equipment_mode='nenhum' then
   new.equipment_snapshot='{"mode":"nenhum"}'::jsonb;
  else
   select * into strict m from public.equipment_models where id=c.equipment_model_id;
   unit=coalesce(c.equipment_custom_cents,case c.equipment_mode when 'comodato' then m.loan_monthly_cents else m.sale_cents end);
   new.equipment_snapshot=jsonb_build_object('mode',c.equipment_mode,'model_id',m.id,'model',m.name,
    'quantity',c.equipment_quantity,'unit_cents',unit,'total_cents',unit*c.equipment_quantity,
    'replacement_cents',m.replacement_cents,
    'min_months',case c.equipment_mode when 'comodato' then c.equipment_min_months end,
    'negotiated',c.equipment_custom_cents is not null);
  end if;
  new.created_by=auth.uid(); new.created_at=clock_timestamp();
 else
  if new.client_id<>old.client_id then raise exception 'Crie uma nova minuta para outra empresa.'; end if;
  new.company_snapshot=old.company_snapshot; new.plan_snapshot=old.plan_snapshot;
  new.equipment_snapshot=old.equipment_snapshot;
  new.created_by=old.created_by; new.created_at=old.created_at;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
revoke all on function private.tinutri_contract_guard(), private.tinutri_equipment_guard(),
  private.touch_equipment_models() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
