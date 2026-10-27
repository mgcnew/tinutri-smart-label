-- Aplicação manual depois do 30 e do 31. "Mover" pelo QR Code da etiqueta. Não apaga dados.
-- 1) update_label_location: troca o local da etiqueta ativa e registra a movimentação na linha do tempo.
-- 2) move_label: mudança de conservação. Regra definida pela consultoria (26/10/2026): a nova validade é a menor
--    entre (agora + prazo do produto na nova conservação) e a validade atual; nunca aumenta. Prazo 0 = não
--    permitido. Gera uma etiqueta nova ligada à original (source_label_id), aguardando impressão.
-- 3) finish_label_move: quando a impressão da nova é confirmada, a original é encerrada como substituída.
--    Até lá a original continua valendo, para o produto nunca ficar sem etiqueta válida.
-- 4) label_lookup passa a informar origem/substituição e, para a equipe, as opções de conservação com a
--    validade resultante.
begin;

-- Mesmas condições de src/lib/label.ts (STORAGE_PRESETS).
create or replace function private.storage_presets() returns text[] language sql immutable set search_path='' as $$
  select array['REFRIGERADO ≤ 5 °C','CONGELADO ≤ -18 °C','RESFRIADO 6 °C A 10 °C','TEMPERATURA AMBIENTE','QUENTE ≥ 60 °C']
$$;

create or replace function private.label_expiry(l public.issued_labels) returns timestamptz language sql stable set search_path='' as $$
  select coalesce(l.expires_at, (l.expires_on + time '23:59:59') at time zone 'America/Sao_Paulo')
$$;

-- Prazo do produto na conservação; sem prazo específico vale o padrão (src/lib/shelf-life.ts).
create or replace function private.storage_days(p_product uuid, p_storage text) returns integer language sql stable security definer set search_path='' as $$
  select case when jsonb_typeof(p.shelf_life_by_storage->p_storage)='number'
    then (p.shelf_life_by_storage->>p_storage)::numeric::integer else p.shelf_life_days end
  from public.products p where p.id=p_product
$$;

create or replace function private.moved_expiry(p_current timestamptz, p_days integer) returns timestamptz language sql stable set search_path='' as $$
  select case when p_days is null or p_days<=0 then null else least(now()+make_interval(days => p_days), p_current) end
$$;

create or replace function private.move_options(l public.issued_labels) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'storage', o.storage, 'days', o.days, 'expires_at', o.expiry,
    'allowed', o.expiry is not null and o.expiry>now()) order by o.ord), '[]'::jsonb)
  from (
    select u.storage, u.ord, d.days, private.moved_expiry(private.label_expiry(l), d.days) as expiry
    from unnest(private.storage_presets()) with ordinality as u(storage, ord)
    cross join lateral (select private.storage_days(l.product_id, u.storage) as days) d
    where u.storage is distinct from l.storage_condition
  ) o
$$;

create or replace function public.update_label_location(_token text, _location text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); l public.issued_labels; place text := nullif(btrim(_location), '');
begin
 if uid is null then raise exception 'Entre na sua conta para mover a etiqueta.' using errcode='42501'; end if;
 if place is null or char_length(place)>80 then raise exception 'Informe o novo local (até 80 caracteres).'; end if;
 select * into l from public.issued_labels where public_token=_token for update;
 if not found then raise exception 'Etiqueta não encontrada.'; end if;
 if not private.user_can_access_client(uid, l.client_id) then raise exception 'Sem acesso a esta etiqueta.' using errcode='42501'; end if;
 if l.label_status<>'ativa' then raise exception 'Etiqueta já baixada.'; end if;
 if l.location is not distinct from place then return jsonb_build_object('state','same'); end if;
 update public.issued_labels set location=place where id=l.id;
 insert into public.label_events(label_id,client_id,event_type,user_id,user_name,metadata)
 values(l.id,l.client_id,'movimentacao',uid,(select coalesce(nullif(btrim(name),''),email) from public.profiles where user_id=uid),
  jsonb_build_object('from', l.location, 'to', place));
 return jsonb_build_object('state','moved');
end; $$;

create or replace function public.move_label(_token text, _storage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); l public.issued_labels; pending public.issued_labels; n public.issued_labels;
 days integer; expiry timestamptz; who text;
begin
 if uid is null then raise exception 'Entre na sua conta para mudar a conservação.' using errcode='42501'; end if;
 select * into l from public.issued_labels where public_token=_token for update;
 if not found then raise exception 'Etiqueta não encontrada.'; end if;
 if not private.user_can_access_client(uid, l.client_id) then raise exception 'Sem acesso a esta etiqueta.' using errcode='42501'; end if;
 if not private.has_permission(uid, 'emitir') then raise exception 'Sem permissão para emitir etiquetas.' using errcode='42501'; end if;
 if not private.client_is_operational(l.client_id) then raise exception 'Empresa sem operação ativa.' using errcode='42501'; end if;
 if l.label_status<>'ativa' or l.print_status::text<>'confirmada' then raise exception 'Só etiquetas ativas e impressas podem mudar de conservação.'; end if;
 if _storage is null or not (_storage = any(private.storage_presets())) then raise exception 'Conservação inválida.'; end if;
 if _storage is not distinct from l.storage_condition then raise exception 'A etiqueta já está nesta conservação.'; end if;
 if l.product_id is null then raise exception 'Produto não encontrado: emita uma nova etiqueta pelo sistema.'; end if;
 days := private.storage_days(l.product_id, _storage);
 expiry := private.moved_expiry(private.label_expiry(l), days);
 if expiry is null then raise exception 'Este produto não pode ficar nesta conservação.'; end if;
 if expiry<=now() then raise exception 'A validade já terminou: dê baixa nesta etiqueta.'; end if;
 who := (select coalesce(nullif(btrim(name),''),email) from public.profiles where user_id=uid);

 -- Uma substituição por vez: a nova da mesma conservação é reaproveitada; outra conservação cancela a pendente.
 select * into pending from public.issued_labels
  where source_label_id=l.id and label_status='ativa' and print_status::text='preparada' order by issued_at desc limit 1 for update;
 if found then
  if pending.storage_condition is not distinct from _storage then
   return jsonb_build_object('state','pending','label', to_jsonb(pending) - 'photo_path');
  end if;
  update public.issued_labels set label_status='cancelada', print_status='cancelada', closed_at=now(), closed_by=uid,
   closed_reason='substituicao_cancelada' where id=pending.id;
 end if;

 insert into public.issued_labels(client_id, product_id, responsible_id, issued_by, issued_by_user_id, client_name, product_name,
  responsible_name, lot_number, inspection_label, opened_on, opened_at, expires_on, expires_at, quantity, label_status, label_kind,
  storage_condition, sector, location, print_status, source_label_id, allergens)
 values(l.client_id, l.product_id, l.responsible_id, uid, uid, l.client_name, l.product_name,
  l.responsible_name, l.lot_number, l.inspection_label, l.opened_on, l.opened_at,
  greatest(l.opened_on, (expiry at time zone 'America/Sao_Paulo')::date), expiry, 1, 'ativa', l.label_kind,
  _storage, l.sector, l.location, 'preparada', l.id, l.allergens)
 returning * into n;
 insert into public.label_events(label_id,client_id,event_type,user_id,user_name,metadata) values
  (l.id,l.client_id,'mudanca_conservacao',uid,who,jsonb_build_object('from',l.storage_condition,'to',_storage,'label_id',n.id)),
  (n.id,n.client_id,'emissao',uid,who,jsonb_build_object('source_label_id',l.id,'motivo','mudanca_conservacao'));
 return jsonb_build_object('state','created','label', to_jsonb(n) - 'photo_path');
end; $$;

create or replace function public.finish_label_move(_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); n public.issued_labels; o public.issued_labels; who text;
begin
 if uid is null then raise exception 'Entre na sua conta para confirmar a impressão.' using errcode='42501'; end if;
 select * into n from public.issued_labels where public_token=_token for update;
 if not found or n.source_label_id is null then raise exception 'Etiqueta nova não encontrada.'; end if;
 if not private.user_can_access_client(uid, n.client_id) then raise exception 'Sem acesso a esta etiqueta.' using errcode='42501'; end if;
 if n.label_status<>'ativa' then raise exception 'Esta etiqueta nova foi cancelada.'; end if;
 if n.print_status::text='confirmada' then return jsonb_build_object('state','done'); end if;
 select * into o from public.issued_labels where id=n.source_label_id for update;
 who := (select coalesce(nullif(btrim(name),''),email) from public.profiles where user_id=uid);
 update public.issued_labels set print_status='confirmada', confirmed_at=now(), confirmed_by=uid where id=n.id;
 insert into public.label_events(label_id,client_id,event_type,user_id,user_name) values (n.id,n.client_id,'impressao_confirmada',uid,who);
 if o.label_status='ativa' then
  update public.issued_labels set label_status='cancelada', closed_at=now(), closed_by=uid, closed_reason='substituida' where id=o.id;
  insert into public.label_events(label_id,client_id,event_type,user_id,user_name,metadata)
  values (o.id,o.client_id,'substituida',uid,who,jsonb_build_object('label_id',n.id));
 end if;
 return jsonb_build_object('state','done');
end; $$;

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
   'expires_at', private.label_expiry(l),
   'storage_condition', l.storage_condition, 'lot_number', l.lot_number, 'inspection_label', l.inspection_label,
   'responsible_name', l.responsible_name, 'label_status', l.label_status, 'label_kind', l.label_kind,
   'issued_at', l.issued_at, 'allergens', coalesce(to_jsonb(l.allergens), '[]'::jsonb), 'print_status', l.print_status),
  'source_token', (select s.public_token from public.issued_labels s where s.id=l.source_label_id),
  'replaced_by_token', (select r.public_token from public.issued_labels r
    where r.source_label_id=l.id and r.label_status<>'cancelada' and r.print_status::text='confirmada' order by r.issued_at desc limit 1),
  'move_options', case when staff and l.label_status='ativa' and l.print_status::text='confirmada' then private.move_options(l) else '[]'::jsonb end,
  'events', coalesce((
   select jsonb_agg(jsonb_build_object('type', e.event_type, 'at', e.created_at, 'by', case when staff then e.user_name end)
    order by e.created_at desc)
   from (select ev.event_type, ev.created_at, ev.user_name from public.label_events ev
    where ev.label_id=l.id and (staff or ev.event_type in
     ('emissao','impressao_confirmada','conferencia','movimentacao','mudanca_conservacao','substituida',
      'baixa_utilizada','baixa_consumida','baixa_descartada'))
    order by ev.created_at desc limit 40) e), '[]'::jsonb));
end; $$;

revoke all on function private.storage_presets(), private.label_expiry(public.issued_labels), private.storage_days(uuid,text),
 private.moved_expiry(timestamptz,integer), private.move_options(public.issued_labels) from public, anon, authenticated;
revoke all on function public.update_label_location(text,text), public.move_label(text,text), public.finish_label_move(text)
 from public, anon, authenticated;
grant execute on function public.update_label_location(text,text), public.move_label(text,text), public.finish_label_move(text) to authenticated;
grant execute on function public.label_lookup(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
