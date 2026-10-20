-- Aplicação manual depois do SQL 22. Não cobra, não convida usuários e não ativa dados existentes.
begin;
alter table public.contract_offers add column if not exists signature_issue text
 check(signature_issue in ('delivery_failed','refused','canceled','deadline'));
create unique index if not exists contract_offers_document_idx on public.contract_offers(provider_document_id) where provider_document_id is not null;
-- Só uma contratação de adesão em aberto por empresa, inclusive entre minutas distintas.
create unique index if not exists contract_offers_company_open_idx on public.contract_offers(client_id) where revoked_at is null and activated_at is null;

create or replace function private.contract_signature_state_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.signature_issue in ('refused','canceled','deadline') and
  (new.signature_issue is distinct from old.signature_issue or new.signature_status<>'failed') then raise exception 'Solicitação interrompida não pode ser retomada.'; end if;
 if old.signature_status='signed' and new.signature_issue is not null then raise exception 'Assinatura concluída não pode regredir.'; end if;
 return new;
end; $$;
drop trigger if exists contract_signature_state_guard on public.contract_offers;
create trigger contract_signature_state_guard before update on public.contract_offers for each row execute function private.contract_signature_state_guard();
revoke all on function private.contract_signature_state_guard() from public,anon,authenticated;

create or replace function public.interrupt_contract_signature(p_offer uuid,p_reason text,p_event_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 if p_reason is null or p_reason not in ('refused','canceled','deadline') or p_event_hash is null or p_event_hash !~ '^[a-f0-9]{64}$' then raise exception 'Evento inválido.'; end if;
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.signature_status='signed' or o.signature_issue in ('refused','canceled','deadline') then return; end if;
 update public.contract_offers set signature_status='failed',signature_issue=p_reason where id=o.id;
 insert into public.contract_offer_events(offer_id,kind,detail) values(o.id,'signature_'||p_reason,jsonb_build_object('event_sha256',p_event_hash));
end; $$;
revoke all on function public.interrupt_contract_signature(uuid,text,text) from public,anon,authenticated;
grant execute on function public.interrupt_contract_signature(uuid,text,text) to service_role;

create or replace function public.complete_contract_signature(p_offer uuid,p_path text,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.signature_status='signed' or o.signature_issue in ('refused','canceled','deadline') then return; end if;
 if o.provider_document_id is null or o.provider_signer_id is null or o.provider_company_signer_id is null or o.provider_signer_id=o.provider_company_signer_id then raise exception 'Provedor incompleto.'; end if;
 if (select count(*) from public.contract_signature_receipts where offer_id=o.id and signer_id in (o.provider_signer_id,o.provider_company_signer_id))<>2 then raise exception 'Aguarde as duas assinaturas.'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_path is distinct from o.id::text||'/signed/'||p_sha256||'.pdf' then raise exception 'Arquivo inválido.'; end if;
 update public.contract_offers set signature_status='signed',signature_issue=null,signed_at=now(),signed_file_path=p_path where id=o.id;
 insert into public.contract_offer_events(offer_id,kind,detail) values(o.id,'signature_completed',jsonb_build_object('file_sha256',p_sha256));
end; $$;
revoke all on function public.complete_contract_signature(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_contract_signature(uuid,text,text) to service_role;

-- O futuro adaptador Asaas só pode inserir depois de consultar e validar o pagamento na API.
-- Não há RPC pública nem botão para criar uma confirmação financeira.
create table if not exists public.contract_payment_confirmations (
 offer_id uuid primary key references public.contract_offers(id),
 provider text not null check(provider='asaas'),
 provider_account_id text not null check(length(btrim(provider_account_id))>0),
 provider_payment_id text not null unique,
 provider_event_id text not null unique,
 environment text not null check(environment in ('sandbox','production')),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency='BRL'),
 confirmed_at timestamptz not null,
 invalidated_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.contract_activation_jobs (
 offer_id uuid primary key references public.contract_offers(id),
 status text not null default 'pending' check(status in ('pending','processing','blocked','completed')),
 worker_token uuid,
 attempts integer not null default 0,
 user_id uuid references auth.users(id),
 started_at timestamptz,
 completed_at timestamptz,
 error_code text check(error_code in ('account_conflict','invite_uncertain','database_unavailable','activation_unavailable')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.contract_payment_confirmations enable row level security;
alter table public.contract_activation_jobs enable row level security;
revoke all on public.contract_payment_confirmations,public.contract_activation_jobs from public,anon,authenticated;
grant select on public.contract_activation_jobs to authenticated;
grant all on public.contract_payment_confirmations,public.contract_activation_jobs to service_role;
drop policy if exists master_activation_read on public.contract_activation_jobs;
create policy master_activation_read on public.contract_activation_jobs for select to authenticated using(private.tinutri_master(auth.uid()));

create or replace function private.contract_can_activate(p_offer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.contract_offers o join public.contract_payment_confirmations p on p.offer_id=o.id
 where o.id=p_offer and o.revoked_at is null and o.signature_status='signed' and o.signed_file_path is not null and o.signed_at is not null
 and o.signature_issue is null and o.signature_environment='production' and o.payment_status='confirmed' and o.paid_at is not null
 and p.environment='production' and p.invalidated_at is null and p.provider_payment_id=o.payment_provider_id
 and p.amount_cents=(o.commercial->'plan'->>'total_cents')::integer and p.currency='BRL');
$$;
create or replace function public.queue_contract_activation(p_offer uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contract_offers where id=p_offer for update;
 if not private.contract_can_activate(p_offer) then raise exception 'Assinatura e pagamento verificados são obrigatórios.'; end if;
 insert into public.contract_activation_jobs(offer_id) values(p_offer) on conflict(offer_id) do nothing;
end; $$;
create or replace function public.claim_contract_activation(p_offer uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.contract_activation_jobs; o public.contract_offers; token uuid;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 select * into strict j from public.contract_activation_jobs where offer_id=p_offer for update;
 if j.status='completed' then return jsonb_build_object('state','completed'); end if;
 if j.status='processing' then return jsonb_build_object('state','busy'); end if;
 if not private.contract_can_activate(o.id) then raise exception 'Contratação não elegível para ativação.'; end if;
 token=gen_random_uuid();
 update public.contract_activation_jobs set status='processing',worker_token=token,attempts=attempts+1,started_at=now(),error_code=null,updated_at=clock_timestamp() where offer_id=o.id;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'activation_started');
 return jsonb_build_object('state','claimed','token',token,'offer_id',o.id,'client_id',o.client_id,'contact',o.access_contact,'user_id',j.user_id);
end; $$;

-- Chamada exclusiva do adaptador financeiro depois de verificar a cobrança na API do provedor.
-- Confirmação, estado comercial e fila são gravados na mesma transação.
create or replace function public.record_verified_contract_payment(p_offer uuid,p_account text,p_payment text,p_event text,p_amount integer,p_currency text,p_environment text,p_confirmed_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; previous public.contract_payment_confirmations;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.signature_status<>'signed' or o.signed_file_path is null or o.signature_issue is not null then raise exception 'Contrato ainda não está apto para pagamento.'; end if;
 if p_amount is null or p_amount<>(o.commercial->'plan'->>'total_cents')::integer or p_currency is distinct from 'BRL'
 or p_environment is distinct from o.signature_environment or p_environment not in ('sandbox','production')
 or p_account is null or length(btrim(p_account))=0 or p_payment is null or length(btrim(p_payment))=0 or p_event is null or length(btrim(p_event))=0
 or p_confirmed_at is null or p_confirmed_at>now()+interval '5 minutes' then raise exception 'Confirmação financeira incompatível.'; end if;
 select * into previous from public.contract_payment_confirmations where offer_id=o.id for update;
 if found then
  if previous.invalidated_at is not null or previous.provider_account_id<>p_account or previous.provider_payment_id<>p_payment or previous.amount_cents<>p_amount or previous.environment<>p_environment then raise exception 'Confirmação financeira divergente ou invalidada.'; end if;
  return;
 end if;
 insert into public.contract_payment_confirmations(offer_id,provider,provider_account_id,provider_payment_id,provider_event_id,environment,amount_cents,currency,confirmed_at)
 values(o.id,'asaas',p_account,p_payment,p_event,p_environment,p_amount,p_currency,p_confirmed_at);
 update public.contract_offers set payment_status='confirmed',payment_provider_id=p_payment,paid_at=p_confirmed_at where id=o.id;
 if p_environment='production' then perform public.queue_contract_activation(o.id); end if;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'payment_confirmed');
end; $$;
revoke all on function public.record_verified_contract_payment(uuid,text,text,text,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_verified_contract_payment(uuid,text,text,text,integer,text,text,timestamptz) to service_role;

-- Esta consulta não expõe diretório de usuários: service_role apenas, e só o e-mail congelado.
create or replace function public.contract_access_candidate(p_offer uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.contract_activation_jobs; o public.contract_offers; u auth.users; c uuid;
begin
 select * into strict j from public.contract_activation_jobs where offer_id=p_offer;
 if j.status<>'processing' or j.worker_token is distinct from p_token then raise exception 'Execução inválida.'; end if;
 select * into strict o from public.contract_offers where id=p_offer;
 select * into u from auth.users where lower(email)=lower(o.access_contact->>'email');
 if not found then return null; end if;
 select client_id into c from public.profiles where user_id=u.id;
 if c=o.client_id and exists(select 1 from public.user_roles where user_id=u.id and role::text='admin_cliente')
 and not exists(select 1 from public.user_roles where user_id=u.id and role::text<>'admin_cliente') then
  return jsonb_build_object('id',u.id,'allowed',true);
 end if;
 if j.user_id=u.id and c is null and not exists(select 1 from public.user_roles where user_id=u.id and role::text<>'operator') then
  return jsonb_build_object('id',u.id,'allowed',true);
 end if;
 return jsonb_build_object('id',u.id,'allowed',false);
end; $$;
create or replace function public.remember_contract_access_user(p_offer uuid,p_token uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.contract_activation_jobs; o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 select * into strict j from public.contract_activation_jobs where offer_id=p_offer for update;
 if j.status<>'processing' or j.worker_token is distinct from p_token or not private.contract_can_activate(p_offer) then raise exception 'Execução inválida.'; end if;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(o.access_contact->>'email')) then raise exception 'Usuário não corresponde ao responsável.'; end if;
 if j.user_id is not null and j.user_id<>p_user then raise exception 'Usuário reservado não pode mudar.'; end if;
 update public.contract_activation_jobs set user_id=p_user,updated_at=clock_timestamp() where offer_id=p_offer;
end; $$;

-- Exceção estreita ao guard do SQL 19, limitada à RPC de ativação verificada.
create or replace function private.contract_activation_context(p_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.role()='service_role',false) and exists(
 select 1 from public.contract_activation_jobs j join public.contract_offers o on o.id=j.offer_id
 where o.client_id=p_client and j.status='processing' and o.id::text=current_setting('tinutri.activation_offer',true)
 and private.contract_can_activate(o.id));
$$;
create or replace function private.tinutri_subscription_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if not private.tinutri_master(auth.uid()) and (new.subscription_started_on is not null or new.subscription_status<>'pendente') then raise exception 'Somente o Master pode gerenciar assinaturas.'; end if;
 elsif (new.subscription_started_on is distinct from old.subscription_started_on or new.subscription_status is distinct from old.subscription_status)
 and not private.tinutri_master(auth.uid()) and not private.contract_activation_context(new.id) then raise exception 'Somente o Master pode gerenciar assinaturas.'; end if;
 if new.subscription_status='ativa' and new.subscription_started_on is null then raise exception 'Informe a data de adesão.'; end if;
 return new;
end; $$;
create or replace function public.finish_contract_activation(p_offer uuid,p_token uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.contract_activation_jobs; o public.contract_offers; candidate jsonb; company_status text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Operação exclusiva de servidor.'; end if;
 select * into strict o from public.contract_offers where id=p_offer for update;
 select * into strict j from public.contract_activation_jobs where offer_id=p_offer for update;
 if j.status='completed' then return; end if;
 if j.status<>'processing' or j.worker_token is distinct from p_token or j.user_id is distinct from p_user then raise exception 'Execução inválida.'; end if;
 if not private.contract_can_activate(o.id) then raise exception 'Contratação não elegível para ativação.'; end if;
 select status::text into strict company_status from public.clients where id=o.client_id for update;
 if company_status='suspensa' then raise exception 'Empresa suspensa exige revisão do Master.'; end if;
 if exists(select 1 from public.contract_offers where client_id=o.client_id and id<>o.id and activated_at is not null) then raise exception 'Empresa já contratada. Use o fluxo de renovação.'; end if;
 lock table public.user_roles in share row exclusive mode;
 perform 1 from auth.users where id=p_user for update;
 perform 1 from public.profiles where user_id=p_user for update;
 candidate=public.contract_access_candidate(o.id,p_token);
 if candidate is null or (candidate->>'id')::uuid<>p_user or (candidate->>'allowed')::boolean is not true then raise exception 'Conta exige revisão antes da vinculação.'; end if;
 insert into public.profiles(user_id,client_id,name,email) values(p_user,o.client_id,o.access_contact->>'name',o.access_contact->>'email')
 on conflict(user_id) do update set client_id=excluded.client_id;
 delete from public.user_roles where user_id=p_user and role::text='operator';
 insert into public.user_roles(user_id,role) values(p_user,'admin_cliente'::public.app_role) on conflict(user_id,role) do nothing;
 perform set_config('tinutri.activation_offer',o.id::text,true);
 update public.clients set status='ativa',plan=o.commercial->'plan'->>'cycle',subscription_status='ativa',subscription_started_on=(now() at time zone 'America/Sao_Paulo')::date where id=o.client_id;
 perform set_config('tinutri.activation_offer','',true);
 update public.contract_offers set activated_at=now() where id=o.id;
 update public.contract_activation_jobs set status='completed',completed_at=now(),worker_token=null,error_code=null,updated_at=clock_timestamp() where offer_id=o.id;
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'access_activated');
end; $$;
create or replace function public.block_contract_activation(p_offer uuid,p_token uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contract_offers where id=p_offer for update;
 if p_code is null or p_code not in ('account_conflict','invite_uncertain','database_unavailable','activation_unavailable') then raise exception 'Código inválido.'; end if;
 update public.contract_activation_jobs set status='blocked',error_code=p_code,worker_token=null,updated_at=clock_timestamp()
 where offer_id=p_offer and status='processing' and worker_token=p_token;
 if found then insert into public.contract_offer_events(offer_id,kind,detail) values(p_offer,'activation_blocked',jsonb_build_object('code',p_code)); end if;
end; $$;
revoke all on function public.queue_contract_activation(uuid),public.claim_contract_activation(uuid),public.contract_access_candidate(uuid,uuid),public.remember_contract_access_user(uuid,uuid,uuid),public.finish_contract_activation(uuid,uuid,uuid),public.block_contract_activation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_contract_activation(uuid),public.claim_contract_activation(uuid),public.contract_access_candidate(uuid,uuid),public.remember_contract_access_user(uuid,uuid,uuid),public.finish_contract_activation(uuid,uuid,uuid),public.block_contract_activation(uuid,uuid,text) to service_role;
revoke all on function private.contract_can_activate(uuid),private.contract_activation_context(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
