-- Aplicação manual em bancos que já receberam o SQL 15. Só substitui public.master_summary:
-- a validação do fuso deixa de consultar pg_timezone_names. Não altera dados nem permissões.
begin;
create or replace function public.master_summary(p_now timestamptz,p_today timestamptz,p_three timestamptz,p_seven timestamptz,p_start timestamptz,p_zone text default 'America/Sao_Paulo',p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito à Área Master.' using errcode='42501'; end if;
 -- AT TIME ZONE valida o fuso em ~2 ms; pg_timezone_names lê os arquivos de fuso (~500 ms).
 begin perform pg_catalog.now() at time zone p_zone; exception when invalid_parameter_value then raise exception 'Período inválido.'; end;
 if p_zone is null or p_start>p_now or p_today<p_now or p_three<p_today or p_seven<p_three then raise exception 'Período inválido.'; end if;
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
revoke all on function public.master_summary(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid) from public,anon;
grant execute on function public.master_summary(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid) to authenticated;
commit;
