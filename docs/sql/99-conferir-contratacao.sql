-- Conferência posterior à instalação. Somente leitura, executar como administrador.
-- Resultado esperado: todos OK e permissões exclusivamente de servidor nas RPCs abaixo.
begin transaction read only;

select objeto,
 case when c.oid is not null and c.relrowsecurity then 'OK' else 'AUSENTE OU SEM RLS' end as resultado
from (values ('public.service_contracts'), ('public.contract_offers'),
 ('public.contract_offer_events'), ('public.contract_signature_receipts'),
 ('public.contract_payment_confirmations'), ('public.contract_activation_jobs'), ('public.contract_payment_checkouts'), ('public.contract_webhook_inbox')) as expected(objeto)
left join pg_class c on c.oid=to_regclass(expected.objeto);

select coluna, case when exists (
 select 1 from information_schema.columns c
 where c.table_schema='public' and c.table_name=expected.tabela and c.column_name=expected.coluna
) then 'OK' else 'AUSENTE' end as resultado
from (values ('service_contracts','commercial_snapshot'), ('contract_offers','signature_issue')) as expected(tabela,coluna);

select rotina, case when p.oid is null then 'AUSENTE'
 when has_function_privilege('anon',p.oid,'EXECUTE')
   or has_function_privilege('authenticated',p.oid,'EXECUTE') then 'REVISAR: ACESSO DE NAVEGADOR'
 when not has_function_privilege('service_role',p.oid,'EXECUTE') then 'REVISAR: SERVIDOR SEM ACESSO'
 else 'OK' end as resultado
from (values
 ('public.complete_contract_signature(uuid,text,text)'),
 ('public.interrupt_contract_signature(uuid,text,text)'),
 ('public.record_verified_contract_payment(uuid,text,text,text,integer,text,text,timestamp with time zone)'),
 ('public.queue_contract_activation(uuid)'),
 ('public.claim_contract_activation(uuid)'),
 ('public.contract_access_candidate(uuid,uuid)'),
 ('public.remember_contract_access_user(uuid,uuid,uuid)'),
 ('public.finish_contract_activation(uuid,uuid,uuid)'),
 ('public.block_contract_activation(uuid,uuid,text)'),
 ('public.claim_contract_checkout(uuid,uuid)'),
 ('public.save_contract_checkout(uuid,uuid,text,text,text)'),
 ('public.block_contract_checkout(uuid,uuid)'),
 ('public.invalidate_sandbox_contract_payment(uuid,text)'),
 ('public.enqueue_contract_webhook(text,text,text,text,text)'),
 ('public.claim_contract_webhook(uuid,uuid)'),
 ('public.finish_contract_webhook(uuid,uuid,text,text)')
) as expected(rotina)
left join pg_proc p on p.oid=to_regprocedure(expected.rotina);

select indice, case when i.indisvalid and i.indisunique then 'OK' else 'AUSENTE OU INVÁLIDO' end as resultado
from (values ('public.contract_offers_company_open_idx'), ('public.contract_offers_document_idx')) as expected(indice)
left join pg_index i on i.indexrelid=to_regclass(expected.indice);

do $$
declare valid_bucket boolean;
begin
 if to_regclass('storage.buckets') is null then
  raise notice 'REVISAR: storage.buckets ausente.';
 else
  execute $query$select exists(select 1 from storage.buckets where id='contract-documents'
   and public=false and file_size_limit=20971520 and allowed_mime_types=array['application/pdf']::text[])$query$ into valid_bucket;
  raise notice 'Bucket privado contract-documents, limite 20 MB e somente PDF: %', case when valid_bucket then 'OK' else 'REVISAR' end;
 end if;
end; $$;

commit;
