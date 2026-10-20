-- Aplicação manual após 23. Sandbox apenas; não cria cobranças nem conecta ao Asaas.
begin;
create table if not exists public.contract_payment_checkouts (
 offer_id uuid primary key references public.contract_offers(id),
 environment text not null check(environment='sandbox'),
 account_id uuid not null,
 status text not null default 'preparing' check(status in ('preparing','ready','blocked')),
 worker_token uuid not null default gen_random_uuid(),
 customer_id text, payment_id text unique, invoice_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'ready' or (customer_id is not null and payment_id is not null and invoice_url is not null))
);
alter table public.contract_payment_checkouts enable row level security;
revoke all on public.contract_payment_checkouts from public,anon,authenticated;
grant select on public.contract_payment_checkouts to authenticated;
grant all on public.contract_payment_checkouts to service_role;
drop policy if exists master_checkouts_read on public.contract_payment_checkouts;
create policy master_checkouts_read on public.contract_payment_checkouts for select to authenticated
 using(private.tinutri_master(auth.uid()));

create or replace function public.claim_contract_checkout(p_offer uuid,p_account uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; j public.contract_payment_checkouts;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.expires_at<=now() or o.signature_status<>'signed'
 or o.signed_file_path is null or o.signature_issue is not null or o.signature_environment<>'sandbox'
 or o.payment_status in ('confirmed','refunded') or o.activated_at is not null
 or (o.commercial->>'renewal') is distinct from 'manual' or p_account is null
 then raise exception 'Contratação não elegível para pagamento sandbox.'; end if;
 select * into j from public.contract_payment_checkouts where offer_id=o.id for update;
 if found then
  if j.account_id<>p_account then raise exception 'A conta Asaas foi alterada. Revise a contratação existente.'; end if;
  return to_jsonb(j)||jsonb_build_object('state',case when j.status='ready' then 'ready' else 'busy' end);
 end if;
 insert into public.contract_payment_checkouts(offer_id,environment,account_id)
 values(o.id,'sandbox',p_account) returning * into j;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_preparing');
 return to_jsonb(j)||jsonb_build_object('state','claimed');
end; $$;

-- A cobrança pode estar aberta mesmo quando a resposta do provedor se perdeu.
create or replace function private.contract_checkout_revoke_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.revoked_at is null and new.revoked_at is not null and exists(
  select 1 from public.contract_payment_checkouts j where j.offer_id=old.id
 ) then raise exception 'Confira e encerre a cobrança Asaas antes de revogar esta contratação.'; end if;
 return new;
end; $$;
revoke all on function private.contract_checkout_revoke_guard() from public,anon,authenticated;
drop trigger if exists contract_checkout_revoke_guard on public.contract_offers;
create trigger contract_checkout_revoke_guard before update on public.contract_offers
 for each row execute function private.contract_checkout_revoke_guard();

create or replace function public.save_contract_checkout(p_offer uuid,p_token uuid,p_customer text,p_payment text default null,p_url text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; j public.contract_payment_checkouts;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 select * into strict j from public.contract_payment_checkouts where offer_id=o.id for update;
 if j.status<>'preparing' or j.worker_token is distinct from p_token or o.revoked_at is not null
 or o.signature_status<>'signed' or o.signature_issue is not null or o.signature_environment<>'sandbox'
 or o.payment_status in ('confirmed','refunded')
 then raise exception 'Preparação de pagamento inválida.'; end if;
 if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9_-]+$'
 or (j.customer_id is not null and j.customer_id<>p_customer)
 then raise exception 'Cliente de pagamento incompatível.'; end if;
 if p_payment is not null and (p_payment !~ '^pay_[A-Za-z0-9_-]+$' or p_url is null
 or p_url !~ '^https://sandbox[.]asaas[.]com/[^[:space:]]+$') then raise exception 'Fatura sandbox inválida.'; end if;
 update public.contract_payment_checkouts set customer_id=p_customer,payment_id=p_payment,invoice_url=p_url,
 status=case when p_payment is null then 'preparing' else 'ready' end,updated_at=clock_timestamp() where offer_id=o.id;
 if p_payment is not null then
  update public.contract_offers set payment_status='pending',payment_provider_id=p_payment where id=o.id;
  insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_created');
 end if;
end; $$;

create or replace function public.block_contract_checkout(p_offer uuid,p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contract_offers where id=p_offer for update;
 update public.contract_payment_checkouts set status='blocked',updated_at=clock_timestamp()
 where offer_id=p_offer and worker_token=p_token and status='preparing';
 if found then insert into public.contract_offer_events(offer_id,kind) values(p_offer,'payment_review_required'); end if;
end; $$;

-- Invalida a prova financeira. Não implementa suspensão de acesso já ativo.
create or replace function public.invalidate_sandbox_contract_payment(p_offer uuid,p_payment text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.signature_environment<>'sandbox' or not exists(select 1 from public.contract_payment_checkouts j
  where j.offer_id=o.id and j.payment_id=p_payment and j.environment='sandbox') then raise exception 'Cobrança incompatível.'; end if;
 if o.payment_status='refunded' then return; end if;
 update public.contract_payment_confirmations set invalidated_at=now() where offer_id=o.id and invalidated_at is null;
 if o.revoked_at is null then update public.contract_offers set payment_status='refunded' where id=o.id; end if;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_invalidated');
end; $$;
revoke all on function public.claim_contract_checkout(uuid,uuid),public.save_contract_checkout(uuid,uuid,text,text,text),
 public.block_contract_checkout(uuid,uuid),public.invalidate_sandbox_contract_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_contract_checkout(uuid,uuid),public.save_contract_checkout(uuid,uuid,text,text,text),
 public.block_contract_checkout(uuid,uuid),public.invalidate_sandbox_contract_payment(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
