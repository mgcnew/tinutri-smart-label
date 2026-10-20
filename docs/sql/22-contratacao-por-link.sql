-- Aplicação manual. Requer SQL 15 e 19. Não envia documentos, não cobra e não ativa empresas.
begin;
alter table public.service_contracts add column if not exists commercial_snapshot jsonb;
create table if not exists public.contract_offers (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.service_contracts(id),
 client_id uuid not null references public.clients(id),
 title text not null, body text not null, body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
 company_name text not null, commercial jsonb not null,
 signer jsonb not null, provider_signer jsonb not null, access_contact jsonb not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, revoked_at timestamptz,
 signature_environment text not null check(signature_environment in ('disabled','sandbox','production')),
 signature_status text not null default 'pending' check(signature_status in ('pending','preparing','awaiting','signed','failed')),
 payment_status text not null default 'unconfigured' check(payment_status in ('unconfigured','pending','confirmed','refunded')),
 provider_envelope_id text unique, provider_document_id text, provider_signer_id text, provider_company_signer_id text,
 signing_url text, signed_file_path text, signed_at timestamptz,
 payment_provider_id text unique, paid_at timestamptz, activated_at timestamptz,
 last_checked_at timestamptz, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(signature_status <> 'signed' or (signed_at is not null and signed_file_path is not null)),
 check(payment_status <> 'confirmed' or (paid_at is not null and payment_provider_id is not null)),
 check(activated_at is null or (signature_status='signed' and payment_status='confirmed' and signature_environment='production' and revoked_at is null))
);
create index if not exists contract_offers_contract_idx on public.contract_offers(contract_id,created_at desc);
-- An expired link is renewed/rotated, never replaced by a competing commercial offer silently.
create unique index if not exists contract_offers_open_idx on public.contract_offers(contract_id) where revoked_at is null;
create table if not exists public.contract_offer_events (
 id bigint generated always as identity primary key,
 offer_id uuid not null references public.contract_offers(id),
 kind text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists contract_offer_events_offer_idx on public.contract_offer_events(offer_id,created_at desc);
alter table public.contract_offers enable row level security;
alter table public.contract_offer_events enable row level security;
revoke all on public.contract_offers, public.contract_offer_events from anon,authenticated;
grant select on public.contract_offers, public.contract_offer_events to authenticated;
grant all on public.contract_offers, public.contract_offer_events to service_role;
grant usage,select on sequence public.contract_offer_events_id_seq to service_role;
drop policy if exists master_offers_read on public.contract_offers;
create policy master_offers_read on public.contract_offers for select to authenticated using(private.tinutri_master(auth.uid()));
drop policy if exists master_offer_events_read on public.contract_offer_events;
create policy master_offer_events_read on public.contract_offer_events for select to authenticated using(private.tinutri_master(auth.uid()));

create or replace function private.contract_offer_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.contract_id,new.client_id,new.title,new.body,new.body_sha256,new.company_name,new.commercial,new.signer,new.provider_signer,new.access_contact,new.signature_environment,new.created_by,new.created_at)
   is distinct from (old.contract_id,old.client_id,old.title,old.body,old.body_sha256,old.company_name,old.commercial,old.signer,old.provider_signer,old.access_contact,old.signature_environment,old.created_by,old.created_at)
  then raise exception 'A contratação publicada é imutável. Prepare outra minuta.'; end if;
  if old.revoked_at is not null then raise exception 'A contratação foi revogada.'; end if;
  if old.signature_status='signed' and new.signature_status<>'signed' then raise exception 'Assinatura concluída não pode regredir.'; end if;
  if old.payment_status='confirmed' and new.payment_status not in ('confirmed','refunded') then raise exception 'Pagamento confirmado não pode regredir.'; end if;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end; $$;
drop trigger if exists contract_offer_guard on public.contract_offers;
create trigger contract_offer_guard before update on public.contract_offers for each row execute function private.contract_offer_guard();

create or replace function public.publish_contract_offer(p_contract uuid,p_updated timestamptz,p_token_hash text,p_body text,p_body_hash text,p_signer jsonb,p_provider_signer jsonb,p_access jsonb,p_days integer,p_environment text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.service_contracts; offer_id uuid; person jsonb;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito ao Master.'; end if;
 select * into strict c from public.service_contracts where id=p_contract for update;
 if c.updated_at<>p_updated then raise exception 'A minuta mudou. Reabra antes de preparar o link.'; end if;
 if c.status='arquivada' then raise exception 'Minuta arquivada.'; end if;
 if p_days is null or p_days not between 1 and 30 then raise exception 'Prazo inválido.'; end if;
 if c.body ~* '\[PENDENTE:' or p_body ~* '\[PENDENTE:' then raise exception 'Complete os campos pendentes.'; end if;
 if p_body is distinct from btrim(regexp_replace(c.body,'^MINUTA PARA REVISÃO — NÃO ASSINADA\s*\n','')) then raise exception 'Documento divergente da minuta.'; end if;
 if c.commercial_snapshot is null or c.commercial_snapshot->>'start' is distinct from 'activation'
 or coalesce(c.commercial_snapshot->>'payment','') not in ('pix','boleto','cartao')
 or coalesce(c.commercial_snapshot->>'renewal','') not in ('manual','automatica')
 or (c.commercial_snapshot->'plan') is distinct from (c.plan_snapshot - 'started_on') then
  raise exception 'Gere uma nova minuta com as condições estruturadas e o plano atual.';
 end if;
 foreach person in array array[p_signer,p_provider_signer,p_access] loop
  if person is null or length(coalesce(person->>'name','')) not between 2 and 120
   or coalesce(person->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Confira os nomes e e-mails.'; end if;
 end loop;
 insert into public.contract_offers(contract_id,client_id,title,body,body_sha256,company_name,commercial,signer,provider_signer,access_contact,token_hash,expires_at,signature_environment,created_by)
 values(c.id,c.client_id,c.title,p_body,p_body_hash,coalesce(c.company_snapshot->>'legal_name',c.company_snapshot->>'name','Empresa'),c.commercial_snapshot,p_signer,p_provider_signer,p_access,p_token_hash,now()+p_days*interval '1 day',p_environment,auth.uid()) returning id into offer_id;
 insert into public.contract_offer_events(offer_id,kind) values(offer_id,'published');
 return offer_id;
end; $$;
revoke all on function public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text) from public,anon;
grant execute on function public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text) to authenticated;

-- Rotation invalidates the previous link immediately; it does not extend the provider's signing deadline.
create or replace function public.rotate_contract_offer(p_offer uuid,p_token_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito ao Master.'; end if;
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null or o.expires_at<=now() then raise exception 'Link expirado ou revogado. Revogue a contratação e prepare uma nova.'; end if;
 update public.contract_offers set token_hash=p_token_hash where id=p_offer;
 insert into public.contract_offer_events(offer_id,kind) values(p_offer,'link_rotated');
end; $$;
revoke all on function public.rotate_contract_offer(uuid,text) from public,anon;
grant execute on function public.rotate_contract_offer(uuid,text) to authenticated;

-- Minimal verified signature receipts, deduplicated even when webhooks arrive out of order.
create table if not exists public.contract_signature_receipts (
 offer_id uuid not null references public.contract_offers(id),
 signer_id text not null,
 event_sha256 text not null unique check(event_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null default now(),
 primary key(offer_id,signer_id)
);
alter table public.contract_signature_receipts enable row level security;
revoke all on public.contract_signature_receipts from public,anon,authenticated;
grant all on public.contract_signature_receipts to service_role;

-- Only the server can complete a signature, with receipts for both configured representatives.
create or replace function public.complete_contract_signature(p_offer uuid,p_path text,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.revoked_at is not null then return; end if;
 if o.signature_status='signed' then return; end if;
 if o.provider_document_id is null or o.provider_signer_id is null or o.provider_company_signer_id is null then raise exception 'Provedor incompleto.'; end if;
 if (select count(*) from public.contract_signature_receipts where offer_id=o.id and signer_id in (o.provider_signer_id,o.provider_company_signer_id)) <> 2 then raise exception 'Aguarde as duas assinaturas.'; end if;
 if p_sha256 !~ '^[a-f0-9]{64}$' or p_path is distinct from o.id::text||'/signed/'||p_sha256||'.pdf' then raise exception 'Arquivo inválido.'; end if;
 update public.contract_offers set signature_status='signed',signed_at=now(),signed_file_path=p_path where id=o.id;
 insert into public.contract_offer_events(offer_id,kind,detail) values(o.id,'signature_completed',jsonb_build_object('file_sha256',p_sha256));
end; $$;
revoke all on function public.complete_contract_signature(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_contract_signature(uuid,text,text) to service_role;

-- Private artifacts only. Public downloads use a server-validated offer token and short signed URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('contract-documents','contract-documents',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
revoke all on function private.contract_offer_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
