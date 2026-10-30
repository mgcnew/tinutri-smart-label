-- Aplicação manual depois do 19. Dados fixos da TiNutri (prestadora) para preencher contratos novos.
-- Uma única linha, lida e gravada só pelo Master. Os contratos já gerados não mudam: os dados entram no texto
-- da minuta no momento da geração. Não apaga dados.
begin;

create table if not exists public.tinutri_profile (
  id boolean primary key default true check (id),
  legal_name text not null default '' check (char_length(legal_name) <= 240),
  cnpj text not null default '' check (char_length(cnpj) <= 240),
  address text not null default '' check (char_length(address) <= 240),
  representative text not null default '' check (char_length(representative) <= 240),
  representative_email text not null default '' check (char_length(representative_email) <= 160),
  email text not null default '' check (char_length(email) <= 240),
  phone text not null default '' check (char_length(phone) <= 240),
  support_channel text not null default '' check (char_length(support_channel) <= 240),
  support_hours text not null default '' check (char_length(support_hours) <= 240),
  export_days integer check (export_days between 1 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists tinutri_profile_updated_by_fk_idx on public.tinutri_profile(updated_by);

alter table public.tinutri_profile enable row level security;
drop policy if exists master_tinutri_profile on public.tinutri_profile;
create policy master_tinutri_profile on public.tinutri_profile for all to authenticated
  using (private.tinutri_master((select auth.uid())))
  with check (private.tinutri_master((select auth.uid())));

revoke all on public.tinutri_profile from anon, authenticated;
grant select, insert, update on public.tinutri_profile to authenticated;

create or replace function private.touch_tinutri_profile() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists touch_tinutri_profile on public.tinutri_profile;
create trigger touch_tinutri_profile before insert or update on public.tinutri_profile
  for each row execute function private.touch_tinutri_profile();

commit;
