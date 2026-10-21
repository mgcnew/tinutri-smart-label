-- Aplicação manual após 24. Somente estrutura de recebimento; não cobra nem libera usuários.
begin;
create table if not exists public.contract_webhook_inbox (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'asaas' check(provider='asaas'),
 environment text not null default 'sandbox' check(environment='sandbox'),
 event_id text not null check(length(event_id) between 1 and 200),
 event_type text not null check(event_type in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL','PAYMENT_DELETED')),
 payment_id text not null check(payment_id ~ '^pay_[A-Za-z0-9_-]+$'),
 external_reference text check(length(external_reference)<=500),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','processing','completed','blocked')),
 result_code text check(result_code in ('ignored','binding_pending','account_mismatch','payment_mismatch','invalidated','waiting','confirmed_sandbox','signature_required','retry')),
 deliveries integer not null default 1, attempts integer not null default 0,
 worker_token uuid, locked_until timestamptz, next_attempt_at timestamptz not null default now(),
 received_at timestamptz not null default now(), last_received_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), processed_at timestamptz,
 last_retry_by uuid references auth.users(id),
 unique(provider,environment,event_id)
);
create index if not exists contract_webhook_inbox_pending_idx on public.contract_webhook_inbox(next_attempt_at,received_at) where status in ('pending','processing');
create index if not exists contract_webhook_inbox_recent_idx on public.contract_webhook_inbox(received_at desc,id);
alter table public.contract_webhook_inbox enable row level security;
revoke all on public.contract_webhook_inbox from public,anon,authenticated;
grant select on public.contract_webhook_inbox to authenticated;
grant all on public.contract_webhook_inbox to service_role;
drop policy if exists master_webhook_inbox_read on public.contract_webhook_inbox;
create policy master_webhook_inbox_read on public.contract_webhook_inbox for select to authenticated using(private.tinutri_master(auth.uid()));

create or replace function public.enqueue_contract_webhook(p_event text,p_type text,p_payment text,p_reference text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.contract_webhook_inbox;
begin
 insert into public.contract_webhook_inbox(event_id,event_type,payment_id,external_reference,payload_sha256)
 values(p_event,p_type,p_payment,p_reference,p_hash)
 on conflict(provider,environment,event_id) do update set deliveries=contract_webhook_inbox.deliveries+1,last_received_at=clock_timestamp()
 where contract_webhook_inbox.payload_sha256=excluded.payload_sha256
   and contract_webhook_inbox.event_type=excluded.event_type and contract_webhook_inbox.payment_id=excluded.payment_id
   and contract_webhook_inbox.external_reference is not distinct from excluded.external_reference
 returning * into j;
 if not found then raise exception 'Evento repetido com conteúdo divergente.'; end if;
 return jsonb_build_object('id',j.id,'status',j.status);
end; $$;

create or replace function public.claim_contract_webhook(p_id uuid,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.contract_webhook_inbox; token uuid;
begin
 select * into strict j from public.contract_webhook_inbox where id=p_id for update;
 if j.status='completed' then return null; end if;
 if j.status='processing' and j.locked_until>now() then return null; end if;
 if j.status='blocked' and p_actor is null then return null; end if;
 if j.status='pending' and j.next_attempt_at>now() and p_actor is null then return null; end if;
 if p_actor is not null and not private.tinutri_master(p_actor) then raise exception 'Retomada restrita ao Master.'; end if;
 token=gen_random_uuid();
 update public.contract_webhook_inbox set status='processing',worker_token=token,locked_until=now()+interval '3 minutes',
 attempts=attempts+1,updated_at=clock_timestamp(),last_retry_by=coalesce(p_actor,last_retry_by)
 where id=j.id returning * into j;
 return to_jsonb(j);
end; $$;

create or replace function public.finish_contract_webhook(p_id uuid,p_token uuid,p_status text,p_result text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in ('pending','completed','blocked') or p_result is null or p_result not in
 ('ignored','binding_pending','account_mismatch','payment_mismatch','invalidated','waiting','confirmed_sandbox','signature_required','retry') then raise exception 'Resultado inválido.'; end if;
 update public.contract_webhook_inbox set status=case when p_status='pending' and attempts>=8 then 'blocked' else p_status end,
 result_code=p_result,worker_token=null,locked_until=null,
 next_attempt_at=now()+interval '1 minute',updated_at=clock_timestamp(),
 processed_at=case when p_status='completed' then now() else null end
 where id=p_id and status='processing' and worker_token=p_token;
 if not found then raise exception 'Execução de notificação substituída ou concluída.'; end if;
end; $$;
revoke all on function public.enqueue_contract_webhook(text,text,text,text,text),public.claim_contract_webhook(uuid,uuid),public.finish_contract_webhook(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_contract_webhook(text,text,text,text,text),public.claim_contract_webhook(uuid,uuid),public.finish_contract_webhook(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
