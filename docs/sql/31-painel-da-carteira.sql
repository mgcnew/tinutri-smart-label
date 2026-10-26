-- Aplicação manual. Painel da carteira da consultoria e papel da nutricionista. Não altera dados de etiquetas.
-- 1) Nova permissão "emitir". Ligada por padrão para todos os perfis, exceto a nutricionista: ela acompanha a
--    carteira e o Master pode ligar emissão e descarte caso a caso. "descartar" também passa a vir desligado
--    para a nutricionista. Os demais perfis continuam exatamente como antes.
-- 2) portfolio_health: indicadores por empresa acessível (nutricionista: carteira; Master: todas) calculados com
--    os registros que o sistema já guarda. Só leitura, restrito a nutricionista e Master.
begin;
set local search_path = public;

create or replace function private.default_permission(_rank integer, _perm text)
returns boolean language sql immutable set search_path='' as $$
  select case _perm
    when 'gerir_produtos' then _rank >= 2
    when 'gerir_colaboradores' then _rank >= 2
    when 'gerir_impressoras' then _rank >= 2
    when 'gerir_acessos' then _rank in (2, 3, 5)
    -- A nutricionista (4) acompanha a carteira; a operação é da empresa.
    when 'emitir' then _rank >= 1 and _rank <> 4
    when 'descartar' then _rank >= 1 and _rank <> 4
    when 'ver_historico' then _rank >= 1
    else false end;
$$;

alter table public.user_permissions drop constraint if exists user_permissions_permission_check;
alter table public.user_permissions add constraint user_permissions_permission_check
 check (permission in ('gerir_produtos','gerir_colaboradores','gerir_impressoras','gerir_acessos','emitir','descartar','ver_historico'));

create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(p, private.has_permission(auth.uid(), p)), '{}'::jsonb)
  from unnest(array['gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'emitir', 'descartar', 'ver_historico']) as p;
$$;

create or replace function public.set_member_permission(p_user uuid, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare target_client uuid;
begin
  if p_permission not in ('gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'emitir', 'descartar', 'ver_historico') then
    raise exception 'Permissão inválida.';
  end if;
  target_client := private.assert_can_manage_member(p_user);
  -- Ninguém concede o que não tem, e só o admin da empresa (ou acima) concede a gestão de acessos.
  if p_granted is true and not private.has_permission(auth.uid(), p_permission) then
    raise exception 'Você não pode conceder uma permissão que não possui.' using errcode = '42501';
  end if;
  if p_permission = 'gerir_acessos' and p_granted is true and private.role_rank(auth.uid()) < 3 then
    raise exception 'Só o administrador da empresa concede a gestão de acessos.' using errcode = '42501';
  end if;
  if p_granted is null then
    delete from public.user_permissions where user_id = p_user and permission = p_permission;
  else
    insert into public.user_permissions (user_id, permission, granted, updated_by)
    values (p_user, p_permission, p_granted, auth.uid())
    on conflict (user_id, permission) do update set granted = excluded.granted, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.activity_logs (user_id, user_name, client_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), (select name from public.profiles where user_id = auth.uid()), target_client, 'permissao_atualizada', 'user', p_user,
          jsonb_build_object('permission', p_permission, 'granted', p_granted));
end $$;

-- Emitir passa a exigir a permissão também no banco, além da tela.
alter policy "Users issue labels for accessible clients" on public.issued_labels
 with check (((issued_by = (select auth.uid())) AND private.user_can_access_client((select auth.uid()), client_id) AND private.client_is_operational(client_id) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = issued_labels.product_id) AND (p.client_id = issued_labels.client_id) AND (p.active = true)))) AND (EXISTS ( SELECT 1
   FROM collaborators c
  WHERE ((c.id = issued_labels.responsible_id) AND (c.client_id = issued_labels.client_id) AND (c.active = true))))
  AND (select private.has_permission((select auth.uid()), 'emitir'::text))));

create or replace function public.portfolio_health(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid := (select auth.uid()); now_ts timestamptz := now(); since timestamptz; prev timestamptz;
begin
 if uid is null or private.role_rank(uid) < 4 then raise exception 'Painel restrito à consultoria.' using errcode='42501'; end if;
 if p_days is null or p_days not between 7 and 90 then raise exception 'Período inválido.'; end if;
 since := now_ts - make_interval(days => p_days);
 prev := since - make_interval(days => p_days);
 return coalesce((
  select jsonb_agg(to_jsonb(x) order by x.name, x.id)
  from (
   select c.id, c.name, c.status::text as status,
    count(*) filter (where l.label_status='ativa' and l.print_status::text='confirmada' and l.expiry<now_ts) as expired_open,
    count(*) filter (where l.label_status='ativa' and l.print_status::text='confirmada' and l.expiry>=now_ts and l.expiry<now_ts+interval '3 days') as expiring_soon,
    count(*) filter (where l.issued_at>=since) as issued,
    count(*) filter (where l.issued_at>=prev and l.issued_at<since) as issued_prev,
    count(*) filter (where l.label_status::text in ('utilizada','consumida','descartada') and l.closed_at>=since) as settled,
    count(*) filter (where l.label_status::text in ('utilizada','consumida','descartada') and l.closed_at>=prev and l.closed_at<since) as settled_prev,
    count(*) filter (where l.label_status='descartada' and l.closed_at>=since) as discarded,
    count(*) filter (where l.label_status='descartada' and l.closed_at>=prev and l.closed_at<since) as discarded_prev,
    -- Baixa registrada depois do vencimento: o PVPS não está funcionando.
    count(*) filter (where l.label_status::text in ('utilizada','consumida','descartada') and l.closed_at>=since and l.closed_at>l.expiry) as late_settled,
    count(*) filter (where l.label_kind='recebido' and l.issued_at>=since and nullif(btrim(l.lot_number),'') is null) as received_without_lot,
    max(l.issued_at) as last_issued_at,
    (select count(*) from public.label_events e where e.client_id=c.id and e.event_type='conferencia' and e.created_at>=since) as checks,
    (select split_part(l2.closed_reason, ':', 1) from public.issued_labels l2
      where l2.client_id=c.id and l2.label_status='descartada' and l2.closed_at>=since and l2.closed_reason is not null
      group by 1 order by count(*) desc, 1 limit 1) as top_discard_reason,
    coalesce((select jsonb_agg(jsonb_build_object('name', t.product_name, 'count', t.n) order by t.n desc, t.product_name)
      from (select l3.product_name, count(*) n from public.issued_labels l3
        where l3.client_id=c.id and (
          (l3.label_status='descartada' and l3.closed_at>=since)
          or (l3.label_status='ativa' and l3.print_status::text='confirmada'
              and coalesce(l3.expires_at, (l3.expires_on + time '23:59:59') at time zone 'America/Sao_Paulo')<now_ts))
        group by l3.product_name order by count(*) desc, l3.product_name limit 3) t), '[]'::jsonb) as top_products
   from public.clients c
   left join lateral (
    select l.*, coalesce(l.expires_at, (l.expires_on + time '23:59:59') at time zone 'America/Sao_Paulo') as expiry
    from public.issued_labels l where l.client_id=c.id
   ) l on true
   where private.user_can_access_client(uid, c.id)
   group by c.id, c.name, c.status
  ) x), '[]'::jsonb);
end; $$;

revoke all on function public.portfolio_health(integer) from public, anon, authenticated;
grant execute on function public.portfolio_health(integer) to authenticated;
notify pgrst, 'reload schema';
commit;
