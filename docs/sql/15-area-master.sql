-- TiNutri: executar MANUALMENTE no SQL Editor do Lovable/Supabase.
-- Não altera dados existentes. Depende das tabelas atuais do TiNutri.
begin;
create schema if not exists private;
create or replace function private.tinutri_master(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.user_roles where user_id=u and role::text in ('admin','admin_master'));
$$;
create or replace function private.tinutri_care_access(c uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.tinutri_master(auth.uid()) or (
   exists(select 1 from public.user_roles where user_id=auth.uid() and role::text='nutricionista')
   and exists(select 1 from public.nutritionist_clients n join public.clients e on e.id=n.client_id where n.client_id=c and n.nutritionist_user_id=auth.uid() and e.status::text='ativa'));
$$;
revoke all on function private.tinutri_master(uuid), private.tinutri_care_access(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.tinutri_master(uuid), private.tinutri_care_access(uuid) to authenticated;

create table if not exists public.care_records (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 kind text not null check(kind in ('tarefa','ocorrencia','visita')),
 title text not null check(char_length(btrim(title)) between 2 and 160),
 description text not null default '' check(char_length(description)<=5000),
 status text not null default 'aberta' check(status in ('aberta','em_andamento','concluida')),
 priority text not null default 'normal' check(priority in ('baixa','normal','alta')),
 assigned_to uuid references auth.users(id), assigned_name text, due_on date, next_visit_on date,
 reason text check(reason in ('descarte','processo','impressao','orientacao','outro')),
 product_name text check(char_length(product_name)<=120),
 resolution text not null default '' check(char_length(resolution)<=5000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
 check(kind='ocorrencia' or due_on is not null),
 check(status<>'concluida' or char_length(btrim(resolution))>=2),
 check(next_visit_on is null or (kind='visita' and next_visit_on>due_on))
);
alter table public.care_records enable row level security;
revoke all on public.care_records from anon, authenticated;
grant select, insert, update on public.care_records to authenticated;
grant all on public.care_records to service_role;
drop policy if exists care_read on public.care_records;
drop policy if exists care_insert on public.care_records;
drop policy if exists care_update on public.care_records;
create policy care_read on public.care_records for select to authenticated using(private.tinutri_care_access(client_id));
create policy care_insert on public.care_records for insert to authenticated with check(private.tinutri_care_access(client_id));
create policy care_update on public.care_records for update to authenticated using(private.tinutri_care_access(client_id)) with check(private.tinutri_care_access(client_id));
create index if not exists care_client_date_idx on public.care_records(client_id,created_at desc,id);
create index if not exists care_open_due_idx on public.care_records(due_on,client_id) where status<>'concluida';
create index if not exists care_assignee_idx on public.care_records(assigned_to);
create index if not exists tinutri_labels_expiry_idx on public.issued_labels(expires_at,client_id) where label_status='ativa' and print_status='confirmada';

create or replace function private.tinutri_care_validate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
 if tg_op='UPDATE' and (new.client_id<>old.client_id or new.kind<>old.kind) then raise exception 'Empresa e tipo não podem ser alterados.'; end if;
 if new.assigned_to is not null and not (private.tinutri_master(new.assigned_to)
   or exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id where p.user_id=new.assigned_to and p.client_id=new.client_id and r.role::text in ('operator','gerente','admin_cliente'))
   or exists(select 1 from public.nutritionist_clients n join public.user_roles r on r.user_id=n.nutritionist_user_id where n.nutritionist_user_id=new.assigned_to and n.client_id=new.client_id and r.role::text='nutricionista')) then
   raise exception 'O responsável não tem acesso a esta empresa.';
 end if;
 new.assigned_name=(select name from public.profiles where user_id=new.assigned_to);
 if tg_op='INSERT' then new.created_by=auth.uid(); new.created_at=now(); else new.created_by=old.created_by; new.created_at=old.created_at; end if;
 new.updated_by=auth.uid(); new.updated_at=now();
 if new.status='concluida' then
   if tg_op='INSERT' then new.completed_at=now(); elsif old.status<>'concluida' then new.completed_at=now(); else new.completed_at=old.completed_at; end if;
 else new.completed_at=null; end if;
 return new;
end; $$;
create or replace function private.tinutri_care_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity_logs(user_id,user_name,client_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),(select name from public.profiles where user_id=auth.uid()),new.client_id,
 case when tg_op='INSERT' then 'acompanhamento_criado' else 'acompanhamento_atualizado' end,'care',new.id,
 jsonb_build_object('name',new.title,'before',case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end,'after',to_jsonb(new)));
 return new;
end; $$;
revoke all on function private.tinutri_care_validate(),private.tinutri_care_audit() from public,anon,authenticated;
drop trigger if exists care_validate on public.care_records;
drop trigger if exists care_audit on public.care_records;
create trigger care_validate before insert or update on public.care_records for each row execute function private.tinutri_care_validate();
create trigger care_audit after insert or update on public.care_records for each row execute function private.tinutri_care_audit();

create or replace function public.master_directory(p_kind text,p_search text default '',p_filter text default '',p_client uuid default null,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito à Área Master.' using errcode='42501'; end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 50 or length(p_search)>2000 then raise exception 'Consulta inválida.'; end if;
 if p_kind='empresas' then
   with filtered as materialized(select c.* from public.clients c where
     (p_search='' or concat_ws(' ',c.name,c.legal_name,c.cnpj,c.city,c.state) ~* p_search)
     and (p_filter='' or (p_filter='sem_responsavel' and not exists(select 1 from public.nutritionist_clients n join public.user_roles r on r.user_id=n.nutritionist_user_id where n.client_id=c.id and r.role::text='nutricionista')) or c.status::text=p_filter)),
   page as(select * from filtered order by name,id offset p_offset limit p_limit)
   select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(to_jsonb(page)||jsonb_build_object('nutritionists',(select coalesce(jsonb_agg(p.name order by p.name),'[]'::jsonb) from public.nutritionist_clients n join public.profiles p on p.user_id=n.nutritionist_user_id join public.user_roles r on r.user_id=p.user_id and r.role::text='nutricionista' where n.client_id=page.id))), '[]'::jsonb)) into result from page;
 elsif p_kind in ('usuarios','carteira') then
   with filtered as materialized(
     select p.user_id,p.name,coalesce(a.email,p.email) email,p.client_id,c.name company_name,
       case when r.role='admin' then 'admin_master' else r.role end role,
       a.last_sign_in_at,a.invited_at,
       case when a.id is null then 'sem_conta' when a.last_sign_in_at is not null then 'ativo' when a.invited_at is not null then 'convidado' else 'primeiro_acesso' end access_status,
       (select count(*) from public.nutritionist_clients n where n.nutritionist_user_id=p.user_id) client_count
     from public.profiles p left join public.clients c on c.id=p.client_id
     left join auth.users a on a.id=p.user_id
     left join lateral(select role::text role from public.user_roles where user_id=p.user_id order by case role::text when 'admin_master' then 0 when 'admin' then 0 when 'nutricionista' then 1 else 2 end limit 1) r on true
     where (p_search='' or concat_ws(' ',p.name,coalesce(a.email,p.email),p.user_id::text) ~* p_search) and (p_client is null or p.client_id=p_client)
       and (p_filter='' or case when r.role='admin' then 'admin_master' else r.role end=p_filter)
       and (p_kind<>'carteira' or r.role='nutricionista')),
   page as(select * from filtered order by name,user_id offset p_offset limit p_limit)
   select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(to_jsonb(page) order by page.name,page.user_id),'[]'::jsonb)) into result from page;
 else raise exception 'Seção inválida.'; end if;
 return result;
end; $$;

create or replace function public.master_summary(p_now timestamptz,p_today timestamptz,p_three timestamptz,p_seven timestamptz,p_start timestamptz,p_zone text default 'America/Sao_Paulo',p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito à Área Master.' using errcode='42501'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) or p_start>p_now or p_today<p_now or p_three<p_today or p_seven<p_three then raise exception 'Período inválido.'; end if;
 with labels as materialized(select *,coalesce(expires_at,(expires_on+time '23:59:59') at time zone p_zone) expiry from public.issued_labels where p_client is null or client_id=p_client)
 select jsonb_build_object(
 'companies',(select count(*) from public.clients where p_client is null or id=p_client),
 'active',(select count(*) from public.clients where status::text='ativa' and (p_client is null or id=p_client)),
 'suspended',(select count(*) from public.clients where status::text='suspensa' and (p_client is null or id=p_client)),
 'unassigned',(select count(*) from public.clients c where (p_client is null or c.id=p_client) and not exists(select 1 from public.nutritionist_clients n join public.user_roles r on r.user_id=n.nutritionist_user_id and r.role::text='nutricionista' where n.client_id=c.id)),
 'products',(select count(*) from public.products where active and (p_client is null or client_id=p_client)),
 'team',(select count(*) from public.collaborators where active and (p_client is null or client_id=p_client)),
 'issued',(select count(*) from labels where issued_at>=p_start and issued_at<=p_now),
 'discarded',(select count(*) from labels where label_status='descartada' and closed_at>=p_start and closed_at<=p_now),
 'expired',(select count(*) from labels where label_status='ativa' and print_status='confirmada' and expiry<=p_now),
 'today',(select count(*) from labels where label_status='ativa' and print_status='confirmada' and expiry>p_now and expiry<=p_today),
 'three',(select count(*) from labels where label_status='ativa' and print_status='confirmada' and expiry>p_today and expiry<=p_three),
 'seven',(select count(*) from labels where label_status='ativa' and print_status='confirmada' and expiry>p_three and expiry<=p_seven),
 'overdue',(select count(*) from public.care_records where status<>'concluida' and due_on<(p_now at time zone p_zone)::date and (p_client is null or client_id=p_client)),
 'open',(select count(*) from public.care_records where status<>'concluida' and (p_client is null or client_id=p_client))
 ) into result; return result;
end; $$;

create or replace function public.care_people(p_client uuid,p_search text default '',p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.tinutri_care_access(p_client) then raise exception 'Sem acesso a esta empresa.' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or length(p_search)>2000 then raise exception 'Consulta inválida.'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.user_id,p.name,p.email from public.profiles p where (p_search='' or concat_ws(' ',p.name,p.email,p.user_id::text) ~* p_search)
 and (private.tinutri_master(p.user_id) or (p.client_id=p_client and exists(select 1 from public.user_roles r where r.user_id=p.user_id and r.role::text in ('operator','gerente','admin_cliente'))) or exists(select 1 from public.nutritionist_clients n join public.user_roles r on r.user_id=n.nutritionist_user_id and r.role::text='nutricionista' where n.nutritionist_user_id=p.user_id and n.client_id=p_client)) order by p.name,p.user_id limit p_limit) x);
end; $$;

create or replace function public.master_update_access(p_user uuid,p_name text,p_role text,p_client uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare old_profile jsonb; old_role text;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito à Área Master.' using errcode='42501'; end if;
 if char_length(btrim(p_name)) not between 2 and 120 or p_role not in ('admin_master','nutricionista','admin_cliente','gerente','operator') then raise exception 'Dados inválidos.'; end if;
 if p_role in ('operator','gerente','admin_cliente') and not exists(select 1 from public.clients where id=p_client) then raise exception 'Selecione uma empresa válida.'; end if;
 if p_role in ('admin_master','nutricionista') then p_client=null; end if;
 lock table public.user_roles in share row exclusive mode;
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito à Área Master.' using errcode='42501'; end if;
 select to_jsonb(p) into old_profile from public.profiles p where user_id=p_user for update;
 if old_profile is null then raise exception 'Usuário não encontrado.'; end if;
 select role::text into old_role from public.user_roles where user_id=p_user order by case when role::text in ('admin','admin_master') then 0 else 1 end limit 1;
 if p_role<>'admin_master' and old_role in ('admin','admin_master') and
 (p_user=auth.uid() or not exists(select 1 from public.user_roles where user_id<>p_user and role::text in ('admin','admin_master'))) then raise exception 'Não é possível remover seu próprio acesso master ou o último administrador.'; end if;
 update public.profiles set name=btrim(p_name),client_id=p_client where user_id=p_user;
 delete from public.user_roles where user_id=p_user;
 insert into public.user_roles(user_id,role) values(p_user,p_role::public.app_role);
 if p_role<>'nutricionista' then delete from public.nutritionist_clients where nutritionist_user_id=p_user; end if;
 update public.collaborators set active=(p_role='operator' and client_id=p_client),name=btrim(p_name) where user_id=p_user;
 if p_role='operator' and not exists(select 1 from public.collaborators where user_id=p_user and client_id=p_client) then insert into public.collaborators(user_id,client_id,name,active) values(p_user,p_client,btrim(p_name),true); end if;
 insert into public.activity_logs(user_id,user_name,client_id,action,entity_type,entity_id,metadata) values(auth.uid(),(select name from public.profiles where user_id=auth.uid()),p_client,'usuario_atualizado','user',p_user,jsonb_build_object('name',p_name,'before',old_profile||jsonb_build_object('role',old_role),'after',jsonb_build_object('name',p_name,'role',p_role,'client_id',p_client)));
end; $$;
revoke all on function public.master_directory(text,text,text,uuid,integer,integer),public.master_summary(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid),public.care_people(uuid,text,integer),public.master_update_access(uuid,text,text,uuid) from public,anon;
grant execute on function public.master_directory(text,text,text,uuid,integer,integer),public.master_summary(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid),public.care_people(uuid,text,integer),public.master_update_access(uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
