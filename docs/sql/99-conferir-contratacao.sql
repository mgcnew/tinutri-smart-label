-- Conferência posterior à instalação. Somente leitura, executar como administrador.
-- Resultado esperado: todos OK e permissões exclusivamente de servidor nas RPCs abaixo.
begin transaction read only;

select objeto,
 case when c.oid is not null and c.relrowsecurity then 'OK' else 'AUSENTE OU SEM RLS' end as resultado
from (values ('public.service_contracts'), ('public.contract_offers'),
 ('public.contract_offer_events'), ('public.contract_signature_receipts'),
 ('public.contract_payment_confirmations'), ('public.contract_activation_jobs'), ('public.contract_payment_checkouts'), ('public.contract_webhook_inbox'),
 ('public.contract_own_documents'), ('public.contract_own_challenges'),
 ('public.contract_own_acceptances'), ('public.contract_own_mail_outbox')) as expected(objeto)
left join pg_class c on c.oid=to_regclass(expected.objeto);

select coluna, case when exists (
 select 1 from information_schema.columns c
 where c.table_schema='public' and c.table_name=expected.tabela and c.column_name=expected.coluna
) then 'OK' else 'AUSENTE' end as resultado
from (values ('service_contracts','commercial_snapshot'), ('contract_offers','signature_issue'), ('contract_offers','signature_method')) as expected(tabela,coluna);

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
 -- Criada pelo SQL 29 (Asaas de produção); AUSENTE antes dele.
 ('public.invalidate_contract_payment(uuid,text)'),
 -- Depois do SQL 29 a fila tem 6 argumentos; antes dele, 5.
 ('public.enqueue_contract_webhook(text,text,text,text,text,text)|public.enqueue_contract_webhook(text,text,text,text,text)'),
 ('public.claim_contract_webhook(uuid,uuid)'),
 ('public.finish_contract_webhook(uuid,uuid,text,text)'),
 ('public.register_own_contract_document(uuid,text)'),
 ('public.issue_own_signature_code(uuid,uuid,text,text,uuid,text,text,text,text,text)'),
 ('public.claim_own_signature_mail(uuid)'),
 ('public.finish_own_signature_mail(uuid,uuid,boolean)'),
 ('public.confirm_own_signature(uuid,text,text,uuid)'),
 ('public.finish_own_contract_signature(uuid,text,text,jsonb,text,text)'),
 ('public.expire_own_signature_codes()')
) as expected(rotina)
left join pg_proc p on p.oid=coalesce(to_regprocedure(split_part(expected.rotina,'|',1)),
 to_regprocedure(nullif(split_part(expected.rotina,'|',2),'')));

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
