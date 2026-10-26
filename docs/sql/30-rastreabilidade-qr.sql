-- Aplicação manual. Rastreabilidade pelo QR Code da etiqueta. Não altera nem apaga dados nem funções existentes.
-- 1) label_lookup: a consulta pública passa a trazer os alérgenos (a função antiga get_label_by_token não os
--    devolvia no projeto remoto) e a linha do tempo da etiqueta. Visitantes veem só os marcos (emissão,
--    impressão, conferências e baixa), sem nomes; a equipe com acesso à empresa vê todos os eventos e quem fez.
-- 2) register_label_check: registra a conferência feita por alguém da equipe ao ler o QR, no máximo uma vez a
--    cada 10 minutos por pessoa e etiqueta, e só enquanto a etiqueta está ativa.
-- get_label_by_token continua existindo para versões anteriores da página.
begin;

create or replace function public.label_lookup(_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.issued_labels; staff boolean;
begin
 if _token is null or length(_token) not between 8 and 200 then return null; end if;
 select * into l from public.issued_labels where public_token=_token;
 if not found then return null; end if;
 staff := (select auth.uid()) is not null and private.user_can_access_client((select auth.uid()), l.client_id);
 return jsonb_build_object(
  'staff', staff,
  'label', jsonb_build_object(
   'id', l.id, 'public_token', l.public_token, 'product_name', l.product_name,
   'client_name', (select c.name from public.clients c where c.id=l.client_id),
   'sector', l.sector, 'location', l.location,
   'opened_at', coalesce(l.opened_at, (l.opened_on::timestamp at time zone 'America/Sao_Paulo')),
   'expires_at', coalesce(l.expires_at, (l.expires_on::timestamp at time zone 'America/Sao_Paulo')),
   'storage_condition', l.storage_condition, 'lot_number', l.lot_number, 'inspection_label', l.inspection_label,
   'responsible_name', l.responsible_name, 'label_status', l.label_status, 'label_kind', l.label_kind,
   'issued_at', l.issued_at, 'allergens', coalesce(to_jsonb(l.allergens), '[]'::jsonb)),
  'events', coalesce((
   select jsonb_agg(jsonb_build_object('type', e.event_type, 'at', e.created_at, 'by', case when staff then e.user_name end)
    order by e.created_at desc)
   from (select ev.event_type, ev.created_at, ev.user_name from public.label_events ev
    where ev.label_id=l.id and (staff or ev.event_type in
     ('emissao','impressao_confirmada','conferencia','baixa_utilizada','baixa_consumida','baixa_descartada'))
    order by ev.created_at desc limit 40) e), '[]'::jsonb));
end; $$;

create or replace function public.register_label_check(_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.issued_labels; uid uuid := (select auth.uid()); last_check timestamptz; who text;
begin
 if uid is null then raise exception 'Entre na sua conta para registrar a conferência.' using errcode='42501'; end if;
 if _token is null or length(_token) not between 8 and 200 then raise exception 'Etiqueta não encontrada.'; end if;
 -- Trava a etiqueta para que leituras simultâneas da mesma pessoa não dupliquem o registro.
 select * into l from public.issued_labels where public_token=_token for update;
 if not found then raise exception 'Etiqueta não encontrada.'; end if;
 if not private.user_can_access_client(uid, l.client_id) then raise exception 'Sem acesso a esta etiqueta.' using errcode='42501'; end if;
 if l.label_status<>'ativa' then return jsonb_build_object('state','closed'); end if;
 select max(created_at) into last_check from public.label_events
  where label_id=l.id and user_id=uid and event_type='conferencia';
 if last_check is not null and last_check>now()-interval '10 minutes' then
  return jsonb_build_object('state','recent','at',last_check);
 end if;
 select coalesce(nullif(btrim(p.name),''), p.email) into who from public.profiles p where p.user_id=uid;
 insert into public.label_events(label_id,client_id,event_type,user_id,user_name)
 values(l.id,l.client_id,'conferencia',uid,who);
 return jsonb_build_object('state','registered');
end; $$;

revoke all on function public.label_lookup(text), public.register_label_check(text) from public, anon, authenticated;
grant execute on function public.label_lookup(text) to anon, authenticated;
grant execute on function public.register_label_check(text) to authenticated;
notify pgrst, 'reload schema';
commit;
