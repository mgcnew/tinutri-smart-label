-- Aplicação manual depois do 19 e do 23. Valores da mensalidade editáveis pelo Master.
-- 1) billing_prices: preço mensal equivalente de cada período (mensal, trimestral, anual), começando nos
--    valores que estavam fixos no código. Qualquer usuário autenticado lê; só o Master grava.
-- 2) clients.custom_monthly_cents: valor mensal negociado com uma empresa (opcional). Quando preenchido,
--    substitui o preço da tabela para aquela empresa, em qualquer período. Só o Master altera.
-- O preço entra no plan_snapshot quando a minuta é criada; contratos já gerados mantêm o valor assinado.
-- Não apaga dados.
begin;

create table if not exists public.billing_prices (
  cycle text primary key check (cycle in ('mensal','trimestral','anual')),
  monthly_cents integer not null check (monthly_cents between 100 and 10000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists billing_prices_updated_by_fk_idx on public.billing_prices(updated_by);
insert into public.billing_prices(cycle, monthly_cents, updated_by)
  values ('mensal',5990,null),('trimestral',5490,null),('anual',4990,null)
  on conflict (cycle) do nothing;

alter table public.billing_prices enable row level security;
drop policy if exists read_billing_prices on public.billing_prices;
create policy read_billing_prices on public.billing_prices for select to authenticated using (true);
drop policy if exists master_billing_prices on public.billing_prices;
create policy master_billing_prices on public.billing_prices for update to authenticated
  using (private.tinutri_master((select auth.uid())))
  with check (private.tinutri_master((select auth.uid())));
revoke all on public.billing_prices from anon, authenticated;
grant select, update (monthly_cents) on public.billing_prices to authenticated;

create or replace function private.touch_billing_prices() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists touch_billing_prices on public.billing_prices;
create trigger touch_billing_prices before update on public.billing_prices
  for each row execute function private.touch_billing_prices();

alter table public.clients add column if not exists custom_monthly_cents integer
  check (custom_monthly_cents between 100 and 10000000);

create or replace function private.tinutri_custom_price_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' and new.custom_monthly_cents is not null
      or tg_op='UPDATE' and new.custom_monthly_cents is distinct from old.custom_monthly_cents)
     and not private.tinutri_master(auth.uid()) then
    raise exception 'Somente o Master pode definir o valor negociado.';
  end if;
  return new;
end; $$;
drop trigger if exists tinutri_custom_price_guard on public.clients;
create trigger tinutri_custom_price_guard before insert or update on public.clients
  for each row execute function private.tinutri_custom_price_guard();

-- Mesmo guard do SQL 19, agora lendo o preço da tabela ou o valor negociado da empresa.
create or replace function private.tinutri_contract_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.clients; price integer; months integer;
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
  new.created_by=auth.uid(); new.created_at=clock_timestamp();
 else
  if new.client_id<>old.client_id then raise exception 'Crie uma nova minuta para outra empresa.'; end if;
  new.company_snapshot=old.company_snapshot; new.plan_snapshot=old.plan_snapshot;
  new.created_by=old.created_by; new.created_at=old.created_at;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
revoke all on function private.tinutri_contract_guard(), private.tinutri_custom_price_guard(),
  private.touch_billing_prices() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
