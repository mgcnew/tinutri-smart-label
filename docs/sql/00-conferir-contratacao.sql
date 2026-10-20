-- Diagnóstico anterior à instalação. Executar como administrador no SQL Editor.
-- Somente leitura. Não retorna nomes, e-mails, tokens ou documentos de clientes.
begin transaction read only;

select current_database() as banco, current_user as executor;

select objeto, case when to_regclass(objeto) is null then 'AUSENTE' else 'OK' end as resultado
from (values ('public.clients'), ('public.profiles'), ('public.user_roles'),
 ('auth.users'), ('storage.buckets'), ('public.service_contracts')) as expected(objeto);

select 'private.tinutri_master(uuid)' as requisito_sql_15,
 case when to_regprocedure('private.tinutri_master(uuid)') is null then 'AUSENTE' else 'OK' end as resultado;

select coluna, case when exists (
 select 1 from information_schema.columns c
 where c.table_schema='public' and c.table_name='clients' and c.column_name=expected.coluna
) then 'OK' else 'AUSENTE' end as requisito_sql_19
from (values ('subscription_started_on'), ('subscription_status')) as expected(coluna);

select papel, case when exists (select 1 from pg_roles r where r.rolname=expected.papel)
 then 'OK' else 'AUSENTE' end as resultado
from (values ('anon'), ('authenticated'), ('service_role')) as expected(papel);

select 'public.app_role:admin_cliente' as requisito,
 case when exists (
 select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
 join pg_namespace n on n.oid=t.typnamespace
 where n.nspname='public' and t.typname='app_role' and e.enumlabel='admin_cliente'
 ) then 'OK' else 'AUSENTE' end as resultado;

-- Funciona inclusive quando o SQL 22 ainda não foi aplicado.
do $$
declare conflicts bigint;
begin
 if to_regclass('public.contract_offers') is null then
  raise notice 'SQL 22 ainda ausente: não há contratações para conferir.';
 else
  execute 'select count(*) from (select client_id from public.contract_offers where revoked_at is null and activated_at is null group by client_id having count(*)>1) x' into conflicts;
  raise notice 'Empresas com adesões concorrentes (deve ser 0): %', conflicts;
  execute 'select count(*) from (select provider_document_id from public.contract_offers where provider_document_id is not null group by provider_document_id having count(*)>1) x' into conflicts;
  raise notice 'Documentos de provedor duplicados (deve ser 0): %', conflicts;
 end if;
end; $$;

commit;
