-- Aplicação manual após 24 e 25. Permite que a mesma estrutura de cobrança e de notificações aceite o
-- ambiente de produção do Asaas, ao lado do sandbox. Não cria cobranças, não convida usuários e não ativa
-- empresas: o servidor só usa produção com ASAAS_PRODUCTION_ENABLED=true e contratação publicada em produção.
-- O ambiente da cobrança é sempre o da contratação (signature_environment), nunca um valor do navegador.
begin;

alter table public.contract_payment_checkouts drop constraint if exists contract_payment_checkouts_environment_check;
alter table public.contract_payment_checkouts add constraint contract_payment_checkouts_environment_check
 check(environment in ('sandbox','production'));

create or replace function public.claim_contract_checkout(p_offer uuid,p_account uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; j public.contract_payment_checkouts;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.expires_at<=now() or o.signature_status<>'signed'
 or o.signed_file_path is null or o.signature_issue is not null or o.signature_environment not in ('sandbox','production')
 or o.payment_status in ('confirmed','refunded') or o.activated_at is not null
 or (o.commercial->>'renewal') is distinct from 'manual' or p_account is null
 then raise exception 'Contratação não elegível para pagamento.'; end if;
 select * into j from public.contract_payment_checkouts where offer_id=o.id for update;
 if found then
  if j.account_id<>p_account or j.environment<>o.signature_environment then raise exception 'A conta Asaas foi alterada. Revise a contratação existente.'; end if;
  return to_jsonb(j)||jsonb_build_object('state',case when j.status='ready' then 'ready' else 'busy' end);
 end if;
 insert into public.contract_payment_checkouts(offer_id,environment,account_id)
 values(o.id,o.signature_environment,p_account) returning * into j;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_preparing');
 return to_jsonb(j)||jsonb_build_object('state','claimed');
end; $$;

create or replace function public.save_contract_checkout(p_offer uuid,p_token uuid,p_customer text,p_payment text default null,p_url text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; j public.contract_payment_checkouts;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 select * into strict j from public.contract_payment_checkouts where offer_id=o.id for update;
 if j.status<>'preparing' or j.worker_token is distinct from p_token or o.revoked_at is not null
 or o.signature_status<>'signed' or o.signature_issue is not null or o.signature_environment<>j.environment
 or o.payment_status in ('confirmed','refunded')
 then raise exception 'Preparação de pagamento inválida.'; end if;
 if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9_-]+$'
 or (j.customer_id is not null and j.customer_id<>p_customer)
 then raise exception 'Cliente de pagamento incompatível.'; end if;
 -- A fatura precisa pertencer ao domínio do mesmo ambiente da cobrança.
 if p_payment is not null and (p_payment !~ '^pay_[A-Za-z0-9_-]+$' or p_url is null
 or p_url !~ case j.environment when 'production' then '^https://www[.]asaas[.]com/[^[:space:]]+$'
  else '^https://sandbox[.]asaas[.]com/[^[:space:]]+$' end) then raise exception 'Fatura inválida para o ambiente da cobrança.'; end if;
 update public.contract_payment_checkouts set customer_id=p_customer,payment_id=p_payment,invoice_url=p_url,
 status=case when p_payment is null then 'preparing' else 'ready' end,updated_at=clock_timestamp() where offer_id=o.id;
 if p_payment is not null then
  update public.contract_offers set payment_status='pending',payment_provider_id=p_payment where id=o.id;
  insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_created');
 end if;
end; $$;

-- Estorno, contestação ou exclusão confirmados na API do Asaas de produção. Invalida a prova financeira;
-- uma ativação ainda pendente deixa de ser elegível. Não suspende acesso já liberado: a contratação ativada
-- mantém sua situação (o SQL 22 só admite ativação com pagamento confirmado) e recebe um alerta para o
-- Master até a política comercial de estorno ser definida.
create or replace function public.invalidate_contract_payment(p_offer uuid,p_payment text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if not exists(select 1 from public.contract_payment_checkouts j
  where j.offer_id=o.id and j.payment_id=p_payment and j.environment=o.signature_environment) then raise exception 'Cobrança incompatível.'; end if;
 if o.payment_status='refunded' then return; end if;
 if o.activated_at is not null then
  if not exists(select 1 from public.contract_payment_confirmations where offer_id=o.id and invalidated_at is null) then return; end if;
  update public.contract_payment_confirmations set invalidated_at=now() where offer_id=o.id and invalidated_at is null;
  insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_invalidated'),(o.id,'payment_invalidated_after_activation');
  return;
 end if;
 update public.contract_payment_confirmations set invalidated_at=now() where offer_id=o.id and invalidated_at is null;
 if o.revoked_at is null then update public.contract_offers set payment_status='refunded' where id=o.id; end if;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_invalidated');
end; $$;

alter table public.contract_webhook_inbox drop constraint if exists contract_webhook_inbox_environment_check;
alter table public.contract_webhook_inbox add constraint contract_webhook_inbox_environment_check
 check(environment in ('sandbox','production'));
alter table public.contract_webhook_inbox drop constraint if exists contract_webhook_inbox_result_code_check;
alter table public.contract_webhook_inbox add constraint contract_webhook_inbox_result_code_check
 check(result_code in ('ignored','binding_pending','account_mismatch','payment_mismatch','invalidated','waiting','confirmed_sandbox','confirmed','signature_required','retry'));

-- O ambiente vem do token do webhook autenticado no servidor. A versão de 5 argumentos é substituída
-- para não haver duas funções com o mesmo nome; chamadas antigas continuam valendo como sandbox.
drop function if exists public.enqueue_contract_webhook(text,text,text,text,text);
create or replace function public.enqueue_contract_webhook(p_event text,p_type text,p_payment text,p_reference text,p_hash text,p_environment text default 'sandbox')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.contract_webhook_inbox;
begin
 if p_environment is null or p_environment not in ('sandbox','production') then raise exception 'Ambiente inválido.'; end if;
 insert into public.contract_webhook_inbox(environment,event_id,event_type,payment_id,external_reference,payload_sha256)
 values(p_environment,p_event,p_type,p_payment,p_reference,p_hash)
 on conflict(provider,environment,event_id) do update set deliveries=contract_webhook_inbox.deliveries+1,last_received_at=clock_timestamp()
 where contract_webhook_inbox.payload_sha256=excluded.payload_sha256
   and contract_webhook_inbox.event_type=excluded.event_type and contract_webhook_inbox.payment_id=excluded.payment_id
   and contract_webhook_inbox.external_reference is not distinct from excluded.external_reference
 returning * into j;
 if not found then raise exception 'Evento repetido com conteúdo divergente.'; end if;
 return jsonb_build_object('id',j.id,'status',j.status);
end; $$;

create or replace function public.finish_contract_webhook(p_id uuid,p_token uuid,p_status text,p_result text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in ('pending','completed','blocked') or p_result is null or p_result not in
 ('ignored','binding_pending','account_mismatch','payment_mismatch','invalidated','waiting','confirmed_sandbox','confirmed','signature_required','retry') then raise exception 'Resultado inválido.'; end if;
 update public.contract_webhook_inbox set status=case when p_status='pending' and attempts>=8 then 'blocked' else p_status end,
 result_code=p_result,worker_token=null,locked_until=null,
 next_attempt_at=now()+interval '1 minute',updated_at=clock_timestamp(),
 processed_at=case when p_status='completed' then now() else null end
 where id=p_id and status='processing' and worker_token=p_token;
 if not found then raise exception 'Execução de notificação substituída ou concluída.'; end if;
end; $$;

revoke all on function public.claim_contract_checkout(uuid,uuid),public.save_contract_checkout(uuid,uuid,text,text,text),
 public.invalidate_contract_payment(uuid,text),public.enqueue_contract_webhook(text,text,text,text,text,text),
 public.finish_contract_webhook(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_contract_checkout(uuid,uuid),public.save_contract_checkout(uuid,uuid,text,text,text),
 public.invalidate_contract_payment(uuid,text),public.enqueue_contract_webhook(text,text,text,text,text,text),
 public.finish_contract_webhook(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
