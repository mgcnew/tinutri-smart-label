-- Aplicação manual após 25. Não envia e-mails, não cobra e não ativa empresas.
begin;
alter table public.contract_offers add column if not exists signature_method text not null default 'clicksign' check(signature_method in ('clicksign','tinutri'));
create or replace function private.own_method_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.signature_method is distinct from old.signature_method then raise exception 'Método de assinatura é imutável.'; end if;
 if new.signature_method='tinutri' and (new.provider_document_id is not null or new.provider_signer_id is not null or new.provider_company_signer_id is not null or new.provider_envelope_id is not null) then raise exception 'Assinatura própria não utiliza recibos do provedor externo.'; end if;
 return new;
end; $$;
drop trigger if exists own_method_guard on public.contract_offers;
create trigger own_method_guard before update on public.contract_offers for each row execute function private.own_method_guard();
revoke all on function private.own_method_guard() from public,anon,authenticated;
drop function if exists public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text);
create or replace function public.publish_contract_offer(p_contract uuid,p_updated timestamptz,p_token_hash text,p_body text,p_body_hash text,p_signer jsonb,p_provider_signer jsonb,p_access jsonb,p_days integer,p_environment text,p_method text default 'clicksign')
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.service_contracts; offer_id uuid; person jsonb;
begin
 if p_method is null or p_method not in ('clicksign','tinutri') then raise exception 'Método de assinatura inválido.'; end if;
 if not private.tinutri_master(auth.uid()) then raise exception 'Acesso restrito ao Master.'; end if;
 if p_method='tinutri' and not exists(select 1 from auth.users where id=auth.uid() and lower(email)=lower(p_provider_signer->>'email')) then raise exception 'O representante TiNutri deve usar o e-mail da sua conta Master.'; end if;
 if lower(p_signer->>'email')=lower(p_provider_signer->>'email') then raise exception 'Use e-mails diferentes para os representantes.'; end if;
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
 insert into public.contract_offers(contract_id,client_id,title,body,body_sha256,company_name,commercial,signer,provider_signer,access_contact,token_hash,expires_at,signature_environment,signature_method,created_by)
 values(c.id,c.client_id,c.title,p_body,p_body_hash,coalesce(c.company_snapshot->>'legal_name',c.company_snapshot->>'name','Empresa'),c.commercial_snapshot,p_signer,p_provider_signer,p_access,p_token_hash,now()+p_days*interval '1 day',p_environment,p_method,auth.uid()) returning id into offer_id;
 insert into public.contract_offer_events(offer_id,kind) values(offer_id,'published');
 return offer_id;
end; $$;
revoke all on function public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text,text) from public,anon;
grant execute on function public.publish_contract_offer(uuid,timestamptz,text,text,text,jsonb,jsonb,jsonb,integer,text,text) to authenticated;

create table if not exists public.contract_own_documents (
 offer_id uuid primary key references public.contract_offers(id),
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 original_path text not null,
 created_at timestamptz not null default now(),
 final_path text, final_sha256 text, manifest jsonb, manifest_hmac text, manifest_key_id text,
 check((final_path is null and final_sha256 is null and manifest is null and manifest_hmac is null and manifest_key_id is null)
 or (final_path is not null and final_sha256 ~ '^[a-f0-9]{64}$' and manifest is not null and manifest_hmac ~ '^[a-f0-9]{64}$' and manifest_key_id is not null))
);
create table if not exists public.contract_own_challenges (
 id uuid primary key, offer_id uuid not null references public.contract_offers(id),
 party text not null check(party in ('client','tinutri')),
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 context_hash text not null check(context_hash ~ '^[a-f0-9]{64}$'),
 code_hmac text not null check(code_hmac ~ '^[a-f0-9]{64}$'), key_id text not null,
 origin_hash text not null check(origin_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 attempts integer not null default 0, invalidated_at timestamptz, consumed_at timestamptz
);
create index if not exists own_challenge_limits_idx on public.contract_own_challenges(offer_id,party,created_at desc);
create index if not exists own_origin_limits_idx on public.contract_own_challenges(origin_hash,created_at desc);
create table if not exists public.contract_own_mail_outbox (
 challenge_id uuid primary key references public.contract_own_challenges(id),
 ciphertext text, key_id text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','canceled')),
 worker_token uuid, locked_until timestamptz, attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 sent_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.contract_own_acceptances (
 offer_id uuid not null references public.contract_offers(id), party text not null check(party in ('client','tinutri')),
 challenge_id uuid not null unique references public.contract_own_challenges(id),
 name text not null, email text not null,
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 consent_version text not null check(consent_version='tinutri-email-v1'),
 consent_text text not null,
 actor_id uuid references auth.users(id), accepted_at timestamptz not null default now(),
 primary key(offer_id,party)
);
-- Os objetos de prova não aceitam alterações/exclusões depois de registrados.
create or replace function private.own_evidence_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='contract_own_documents' and tg_op='UPDATE' then
  if (new.offer_id,new.original_sha256,new.original_path,new.created_at) is distinct from (old.offer_id,old.original_sha256,old.original_path,old.created_at)
  or (old.final_path is not null and new is distinct from old) then raise exception 'Documento preservado é imutável.'; end if;
  return new;
 end if;
 raise exception 'Comprovante preservado é imutável.';
end; $$;
drop trigger if exists own_document_guard on public.contract_own_documents;
create trigger own_document_guard before update or delete on public.contract_own_documents for each row execute function private.own_evidence_guard();
drop trigger if exists own_acceptance_guard on public.contract_own_acceptances;
create trigger own_acceptance_guard before update or delete on public.contract_own_acceptances for each row execute function private.own_evidence_guard();
revoke all on function private.own_evidence_guard() from public,anon,authenticated;
alter table public.contract_own_documents enable row level security;
alter table public.contract_own_challenges enable row level security;
alter table public.contract_own_mail_outbox enable row level security;
alter table public.contract_own_acceptances enable row level security;
revoke all on public.contract_own_documents,public.contract_own_challenges,public.contract_own_mail_outbox,public.contract_own_acceptances from public,anon,authenticated;
grant all on public.contract_own_documents,public.contract_own_challenges,public.contract_own_mail_outbox,public.contract_own_acceptances to service_role;

create or replace function private.assert_own_signature(p_offer uuid,p_party text,p_context text,p_actor uuid)
returns public.contract_offers language plpgsql security definer set search_path='' as $$
declare o public.contract_offers;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.signature_method<>'tinutri' or o.revoked_at is not null or o.expires_at<=now() or o.signature_status='signed'
 or o.signature_issue is not null then raise exception 'Assinatura indisponível.'; end if;
 if p_party is null or p_party not in ('client','tinutri') or p_context is null or p_context !~ '^[a-f0-9]{64}$' then raise exception 'Contexto inválido.'; end if;
 if p_party='client' and (p_actor is not null or p_context<>o.token_hash) then raise exception 'Link inválido.'; end if;
 if p_party='tinutri' and (p_actor is null or not private.tinutri_master(p_actor) or not exists(
  select 1 from auth.users where id=p_actor and lower(email)=lower(o.provider_signer->>'email'))) then raise exception 'Representante TiNutri inválido.'; end if;
 return o;
end; $$;
revoke all on function private.assert_own_signature(uuid,text,text,uuid) from public,anon,authenticated;

create or replace function public.register_own_contract_document(p_offer uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; d public.contract_own_documents;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.signature_method<>'tinutri' or o.revoked_at is not null or o.expires_at<=now() or o.signature_issue is not null then raise exception 'Assinatura indisponível.'; end if;
 insert into public.contract_own_documents(offer_id,original_sha256,original_path)
 values(o.id,p_hash,o.id::text||'/original/'||p_hash||'.pdf') on conflict(offer_id) do nothing;
 select * into strict d from public.contract_own_documents where offer_id=o.id;
 if d.original_sha256<>p_hash then raise exception 'PDF original divergente.'; end if;
 return to_jsonb(d);
end; $$;

create or replace function public.issue_own_signature_code(p_id uuid,p_offer uuid,p_party text,p_context text,p_actor uuid,p_hash text,p_hmac text,p_key text,p_ciphertext text,p_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; last_time timestamptz;
begin
 o=private.assert_own_signature(p_offer,p_party,p_context,p_actor);
 if exists(select 1 from public.contract_own_acceptances where offer_id=o.id and party=p_party) then return jsonb_build_object('state','accepted'); end if;
 if p_hash is null or not exists(select 1 from public.contract_own_documents where offer_id=o.id and original_sha256=p_hash) then raise exception 'Preserve o PDF antes de assinar.'; end if;
 if p_key is null or length(p_key) not between 1 and 80 or p_ciphertext is null or length(p_ciphertext)>4096 then raise exception 'Desafio inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_origin,0));
 select max(created_at) into last_time from public.contract_own_challenges where offer_id=o.id and party=p_party;
 if last_time>now()-interval '60 seconds' then return jsonb_build_object('state','rate_limited'); end if;
 if (select count(*) from public.contract_own_challenges where offer_id=o.id and party=p_party and created_at>now()-interval '1 day')>=10
 or (select count(*) from public.contract_own_challenges where origin_hash=p_origin and created_at>now()-interval '1 hour')>=30 then return jsonb_build_object('state','rate_limited'); end if;
 update public.contract_own_mail_outbox set status='canceled',ciphertext=null,worker_token=null,locked_until=null where challenge_id in(
 select id from public.contract_own_challenges where offer_id=o.id and party=p_party and consumed_at is null) and status<>'sent';
 update public.contract_own_challenges set invalidated_at=now() where offer_id=o.id and party=p_party and consumed_at is null and invalidated_at is null;
 insert into public.contract_own_challenges(id,offer_id,party,original_sha256,context_hash,code_hmac,key_id,origin_hash) values(p_id,o.id,p_party,p_hash,p_context,p_hmac,p_key,p_origin);
 insert into public.contract_own_mail_outbox(challenge_id,ciphertext,key_id) values(p_id,p_ciphertext,p_key);
 update public.contract_offers set signature_status='awaiting' where id=o.id and signature_status='pending';
 insert into public.contract_offer_events(offer_id,kind) values(o.id,'signature_code_requested');
 return jsonb_build_object('state','queued','challenge_id',p_id,'expires_at',now()+interval '10 minutes');
end; $$;

create or replace function public.claim_own_signature_mail(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contract_own_challenges; o public.contract_offers; m public.contract_own_mail_outbox;
begin
 select * into strict c from public.contract_own_challenges where id=p_id;
 select * into strict o from public.contract_offers where id=c.offer_id for update;
 select * into strict c from public.contract_own_challenges where id=p_id for update;
 select * into strict m from public.contract_own_mail_outbox where challenge_id=c.id for update;
 if c.invalidated_at is not null or c.consumed_at is not null or c.expires_at<=now() or o.revoked_at is not null or o.expires_at<=now()
 or o.signature_issue is not null or o.signature_status='signed' or (c.party='client' and c.context_hash<>o.token_hash) then
  update public.contract_own_mail_outbox set status='canceled',ciphertext=null,worker_token=null,locked_until=null where challenge_id=c.id; return null;
 end if;
 if m.status in ('sent','canceled') or m.attempts>=3 or m.next_attempt_at>now() or (m.status='sending' and m.locked_until>now()) then return null; end if;
 update public.contract_own_mail_outbox set status='sending',worker_token=gen_random_uuid(),locked_until=now()+interval '1 minute',attempts=attempts+1,updated_at=clock_timestamp() where challenge_id=c.id returning * into m;
 return to_jsonb(m)||jsonb_build_object('offer_id',o.id,'party',c.party,'email',case when c.party='client' then o.signer->>'email' else o.provider_signer->>'email' end,
 'title',o.title,'expires_at',c.expires_at,'original_sha256',c.original_sha256,'context_hash',c.context_hash);
end; $$;
create or replace function public.finish_own_signature_mail(p_id uuid,p_token uuid,p_sent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_sent is null then raise exception 'Resultado inválido.'; end if;
 update public.contract_own_mail_outbox set status=case when p_sent then 'sent' else 'failed' end,
 ciphertext=case when p_sent then null else ciphertext end,sent_at=case when p_sent then now() else null end,
 worker_token=null,locked_until=null,next_attempt_at=now()+interval '30 seconds',updated_at=clock_timestamp()
 where challenge_id=p_id and worker_token=p_token and status='sending';
 -- Reenvio ou revogação pode ter cancelado a reserva enquanto o SMTP concluía.
end; $$;

create or replace function public.confirm_own_signature(p_id uuid,p_context text,p_hmac text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contract_own_challenges; o public.contract_offers; person jsonb;
begin
 select * into strict c from public.contract_own_challenges where id=p_id;
 select * into strict o from public.contract_offers where id=c.offer_id for update;
 select * into strict c from public.contract_own_challenges where id=p_id for update;
 if p_context is distinct from c.context_hash or (c.party='client' and (p_context<>o.token_hash or p_actor is not null))
 or (c.party='tinutri' and (p_actor is null or not private.tinutri_master(p_actor) or not exists(select 1 from auth.users where id=p_actor and lower(email)=lower(o.provider_signer->>'email')))) then return jsonb_build_object('state','invalid'); end if;
 if o.signature_method<>'tinutri' or o.revoked_at is not null or o.expires_at<=now() or o.signature_issue is not null then return jsonb_build_object('state','invalid'); end if;
 if c.consumed_at is not null then return jsonb_build_object('state',case when p_hmac=c.code_hmac then 'accepted' else 'invalid' end); end if;
 if o.signature_method<>'tinutri' or o.revoked_at is not null or o.expires_at<=now() or o.signature_issue is not null or c.invalidated_at is not null or c.expires_at<=now() or c.attempts>=5
 or not exists(select 1 from public.contract_own_documents where offer_id=o.id and original_sha256=c.original_sha256)
 or not exists(select 1 from public.contract_own_mail_outbox where challenge_id=c.id and status='sent') then return jsonb_build_object('state','invalid'); end if;
 if p_hmac is distinct from c.code_hmac then
  update public.contract_own_challenges set attempts=attempts+1 where id=c.id;
  return jsonb_build_object('state','invalid');
 end if;
 person=case when c.party='client' then o.signer else o.provider_signer end;
 insert into public.contract_own_acceptances(offer_id,party,challenge_id,name,email,original_sha256,consent_version,consent_text,actor_id)
 values(o.id,c.party,c.id,person->>'name',person->>'email',c.original_sha256,'tinutri-email-v1',
 'Li o contrato e concordo com seus termos. Confirmo que tenho poderes para representar a parte indicada e assino eletronicamente esta versão por código enviado ao meu e-mail.',p_actor)
 on conflict(offer_id,party) do nothing;
 update public.contract_own_challenges set consumed_at=now() where id=c.id;
 update public.contract_own_mail_outbox set ciphertext=null where challenge_id=c.id;
 insert into public.contract_offer_events(offer_id,kind,detail) values(o.id,'signature_accepted',jsonb_build_object('party',c.party));
 return jsonb_build_object('state','accepted');
end; $$;

create or replace function public.finish_own_contract_signature(p_offer uuid,p_path text,p_sha256 text,p_manifest jsonb,p_hmac text,p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.contract_offers; d public.contract_own_documents;
begin
 select * into strict o from public.contract_offers where id=p_offer for update;
 if o.signature_method<>'tinutri' or o.revoked_at is not null or o.signature_issue is not null then raise exception 'Assinatura indisponível.'; end if;
 if o.signature_status='signed' then return; end if;
 select * into strict d from public.contract_own_documents where offer_id=o.id for update;
 -- Aceites válidos não expiram durante recuperação de falha de armazenamento.
 if (select count(*) from public.contract_own_acceptances where offer_id=o.id and original_sha256=d.original_sha256)<>2 then raise exception 'Aguarde os dois aceites.'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_path is distinct from o.id::text||'/signed/'||p_sha256||'.pdf'
 or p_hmac is null or p_hmac !~ '^[a-f0-9]{64}$' or p_key is null or length(p_key) not between 1 and 80
 or p_manifest is null or p_manifest->>'offer_id' is distinct from o.id::text or p_manifest->>'original_sha256' is distinct from d.original_sha256 then raise exception 'Comprovante inválido.'; end if;
 update public.contract_own_documents set final_path=p_path,final_sha256=p_sha256,manifest=p_manifest,manifest_hmac=p_hmac,manifest_key_id=p_key where offer_id=o.id;
 update public.contract_offers set signature_status='signed',signed_at=now(),signed_file_path=p_path where id=o.id;
 insert into public.contract_offer_events(offer_id,kind,detail) values(o.id,'signature_completed',jsonb_build_object('method','tinutri','file_sha256',p_sha256));
end; $$;

revoke all on function public.register_own_contract_document(uuid,text),public.issue_own_signature_code(uuid,uuid,text,text,uuid,text,text,text,text,text),
 public.claim_own_signature_mail(uuid),public.finish_own_signature_mail(uuid,uuid,boolean),public.confirm_own_signature(uuid,text,text,uuid),
 public.finish_own_contract_signature(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.register_own_contract_document(uuid,text),public.issue_own_signature_code(uuid,uuid,text,text,uuid,text,text,text,text,text),
 public.claim_own_signature_mail(uuid),public.finish_own_signature_mail(uuid,uuid,boolean),public.confirm_own_signature(uuid,text,text,uuid),
 public.finish_own_contract_signature(uuid,text,text,jsonb,text,text) to service_role;
create or replace function public.expire_own_signature_codes()
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.contract_own_mail_outbox m set ciphertext=null,status=case when m.status='sent' then 'sent' else 'canceled' end,worker_token=null,locked_until=null
 from public.contract_own_challenges c where c.id=m.challenge_id and m.ciphertext is not null
 and (c.expires_at<=now() or c.invalidated_at is not null or c.consumed_at is not null);
end; $$;
revoke all on function public.expire_own_signature_codes() from public,anon,authenticated;
grant execute on function public.expire_own_signature_codes() to service_role;
notify pgrst,'reload schema';
commit;
