-- Permissões por pessoa, em cima dos perfis (master, nutricionista, admin da empresa, gerente, colaborador).
-- O perfil define o padrão (igual ao comportamento de antes); um interruptor por pessoa pode liberar ou retirar.
-- A aplicação é no banco (regras de linha e gatilho), não só na tela.

-- Pessoa desativada perde o acesso aos dados da empresa sem apagar o histórico dela.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.user_can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    _client_id IS NOT NULL AND (
      private.is_admin_master(_user_id)
      OR (SELECT client_id FROM public.profiles WHERE user_id = _user_id AND active) = _client_id
      OR private.nutritionist_has_client(_user_id, _client_id)
    );
$$;

CREATE TABLE public.user_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'descartar', 'ver_historico')),
  granted BOOLEAN NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_permissions FROM anon, authenticated;
GRANT ALL ON public.user_permissions TO service_role;
-- Sem política: o acesso é só pelas funções abaixo, que conferem hierarquia e empresa.

-- Posição do perfil: quem tem posição maior gerencia quem tem menor.
CREATE FUNCTION private.role_rank(_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(max(CASE role::text
    WHEN 'admin' THEN 5 WHEN 'admin_master' THEN 5 WHEN 'nutricionista' THEN 4
    WHEN 'admin_cliente' THEN 3 WHEN 'gerente' THEN 2 WHEN 'operator' THEN 1 ELSE 0 END), 0)
  FROM public.user_roles WHERE user_id = _user;
$$;

-- Padrão de cada permissão por posição: reproduz o que cada perfil já podia fazer.
CREATE FUNCTION private.default_permission(_rank integer, _perm text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _perm
    WHEN 'gerir_produtos' THEN _rank >= 2
    WHEN 'gerir_colaboradores' THEN _rank >= 2
    WHEN 'gerir_impressoras' THEN _rank >= 2
    WHEN 'gerir_acessos' THEN _rank IN (2, 3, 5)
    WHEN 'descartar' THEN _rank >= 1
    WHEN 'ver_historico' THEN _rank >= 1
    ELSE false END;
$$;

CREATE FUNCTION private.has_permission(_user uuid, _perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN private.is_admin_master(_user) THEN true
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user AND NOT active) THEN false
    ELSE COALESCE(
      (SELECT granted FROM public.user_permissions WHERE user_id = _user AND permission = _perm),
      private.default_permission(private.role_rank(_user), _perm))
  END;
$$;
REVOKE ALL ON FUNCTION private.role_rank(uuid), private.default_permission(integer, text), private.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text) TO authenticated;

-- ---------- Regras de linha: trocam "é gerente/admin" por "tem a permissão" ----------
DROP POLICY IF EXISTS "Nutri and admin cliente manage products" ON public.products;
DROP POLICY IF EXISTS "Nutri and admin cliente update products" ON public.products;
DROP POLICY IF EXISTS "Nutri and admin cliente delete products" ON public.products;
CREATE POLICY "Permitted users insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_produtos'));
CREATE POLICY "Permitted users update products" ON public.products FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_produtos'))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_produtos'));
CREATE POLICY "Permitted users delete products" ON public.products FOR DELETE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_produtos'));

DROP POLICY IF EXISTS "Nutri and admin cliente insert collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Nutri and admin cliente update collaborators" ON public.collaborators;
CREATE POLICY "Permitted users insert collaborators" ON public.collaborators FOR INSERT TO authenticated
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_colaboradores'));
CREATE POLICY "Permitted users update collaborators" ON public.collaborators FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_colaboradores'))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND private.has_permission(auth.uid(), 'gerir_colaboradores'));

CREATE OR REPLACE FUNCTION private.can_manage_printing(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.user_can_access_client(_user_id, _client_id) AND private.has_permission(_user_id, 'gerir_impressoras');
$$;

-- Descartar exige a permissão (o gatilho de integridade já existia; agora também confere isso).
CREATE OR REPLACE FUNCTION private.guard_label_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF OLD.label_status <> 'ativa' AND NEW.label_status IS DISTINCT FROM OLD.label_status THEN
    RAISE EXCEPTION 'Etiqueta já baixada: o status não pode ser alterado.' USING ERRCODE = '42501';
  END IF;
  IF OLD.print_status = 'confirmada' AND NEW.print_status IS DISTINCT FROM OLD.print_status THEN
    RAISE EXCEPTION 'Impressão já confirmada: o status não pode ser revertido.' USING ERRCODE = '42501';
  END IF;
  IF NEW.label_status = 'descartada' AND OLD.label_status IS DISTINCT FROM NEW.label_status
     AND NOT private.has_permission(auth.uid(), 'descartar') THEN
    RAISE EXCEPTION 'Sem permissão para descartar etiquetas.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ---------- Funções chamadas pelo app ----------
-- Permissões efetivas da própria pessoa (padrão do perfil + ajustes).
CREATE FUNCTION public.my_permissions() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(p, private.has_permission(auth.uid(), p)), '{}'::jsonb)
  FROM unnest(ARRAY['gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'descartar', 'ver_historico']) AS p;
$$;

-- Equipe da empresa com perfil, situação e permissões. Só quem gerencia acessos enxerga.
CREATE FUNCTION public.company_team(p_client uuid)
RETURNS TABLE (user_id uuid, name text, email text, role text, active boolean, manageable boolean, overrides jsonb, effective jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me integer := private.role_rank(auth.uid());
BEGIN
  IF auth.uid() IS NULL OR NOT private.user_can_access_client(auth.uid(), p_client)
     OR NOT private.has_permission(auth.uid(), 'gerir_acessos') THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar acessos.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.user_id, p.name, p.email, r.role::text, p.active,
         (me > private.role_rank(p.user_id) AND p.user_id <> auth.uid()),
         COALESCE((SELECT jsonb_object_agg(up.permission, up.granted) FROM public.user_permissions up WHERE up.user_id = p.user_id), '{}'::jsonb),
         (SELECT jsonb_object_agg(k, private.has_permission(p.user_id, k))
          FROM unnest(ARRAY['gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'descartar', 'ver_historico']) AS k)
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE p.client_id = p_client AND r.role::text IN ('admin_cliente', 'gerente', 'operator')
  ORDER BY private.role_rank(p.user_id) DESC, p.name;
END $$;

-- Valida que o autor pode gerenciar a pessoa-alvo (mesma empresa, posição maior).
CREATE FUNCTION private.assert_can_manage_member(_target uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE target_client uuid;
BEGIN
  SELECT client_id INTO target_client FROM public.profiles WHERE user_id = _target;
  IF auth.uid() IS NULL OR target_client IS NULL OR _target = auth.uid()
     OR NOT private.user_can_access_client(auth.uid(), target_client)
     OR NOT private.has_permission(auth.uid(), 'gerir_acessos')
     OR private.role_rank(auth.uid()) <= private.role_rank(_target) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar esta pessoa.' USING ERRCODE = '42501';
  END IF;
  RETURN target_client;
END $$;
REVOKE ALL ON FUNCTION private.assert_can_manage_member(uuid) FROM PUBLIC, anon, authenticated;

-- Liga, desliga ou volta ao padrão (p_granted nulo) uma permissão da pessoa.
CREATE FUNCTION public.set_member_permission(p_user uuid, p_permission text, p_granted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_client uuid;
BEGIN
  IF p_permission NOT IN ('gerir_produtos', 'gerir_colaboradores', 'gerir_impressoras', 'gerir_acessos', 'descartar', 'ver_historico') THEN
    RAISE EXCEPTION 'Permissão inválida.';
  END IF;
  target_client := private.assert_can_manage_member(p_user);
  -- Ninguém concede o que não tem, e só o admin da empresa (ou acima) concede a gestão de acessos.
  IF p_granted IS TRUE AND NOT private.has_permission(auth.uid(), p_permission) THEN
    RAISE EXCEPTION 'Você não pode conceder uma permissão que não possui.' USING ERRCODE = '42501';
  END IF;
  IF p_permission = 'gerir_acessos' AND p_granted IS TRUE AND private.role_rank(auth.uid()) < 3 THEN
    RAISE EXCEPTION 'Só o administrador da empresa concede a gestão de acessos.' USING ERRCODE = '42501';
  END IF;
  IF p_granted IS NULL THEN
    DELETE FROM public.user_permissions WHERE user_id = p_user AND permission = p_permission;
  ELSE
    INSERT INTO public.user_permissions (user_id, permission, granted, updated_by)
    VALUES (p_user, p_permission, p_granted, auth.uid())
    ON CONFLICT (user_id, permission) DO UPDATE SET granted = excluded.granted, updated_by = excluded.updated_by, updated_at = now();
  END IF;
  INSERT INTO public.activity_logs (user_id, user_name, client_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), (SELECT name FROM public.profiles WHERE user_id = auth.uid()), target_client, 'permissao_atualizada', 'user', p_user,
          jsonb_build_object('permission', p_permission, 'granted', p_granted));
END $$;

-- Desativa ou reativa o acesso de uma pessoa da empresa (o histórico dela permanece).
CREATE FUNCTION public.set_member_active(p_user uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_client uuid;
BEGIN
  target_client := private.assert_can_manage_member(p_user);
  UPDATE public.profiles SET active = p_active WHERE user_id = p_user;
  -- Deixa de aparecer como responsável nas etiquetas novas enquanto estiver desativada.
  UPDATE public.collaborators SET active = p_active WHERE user_id = p_user AND client_id = target_client;
  INSERT INTO public.activity_logs (user_id, user_name, client_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), (SELECT name FROM public.profiles WHERE user_id = auth.uid()), target_client,
          CASE WHEN p_active THEN 'acesso_reativado' ELSE 'acesso_desativado' END, 'user', p_user, '{}'::jsonb);
END $$;

-- Usada pelo convite: confere se o autor pode criar alguém com esse perfil nesta empresa.
CREATE FUNCTION public.can_invite_member(p_client uuid, p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND private.user_can_access_client(auth.uid(), p_client)
    AND private.has_permission(auth.uid(), 'gerir_acessos')
    AND (private.role_rank(auth.uid()) > CASE p_role WHEN 'operator' THEN 1 WHEN 'gerente' THEN 2 ELSE 99 END);
$$;

REVOKE ALL ON FUNCTION public.my_permissions(), public.company_team(uuid), public.set_member_permission(uuid, text, boolean),
  public.set_member_active(uuid, boolean), public.can_invite_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions(), public.company_team(uuid), public.set_member_permission(uuid, text, boolean),
  public.set_member_active(uuid, boolean), public.can_invite_member(uuid, text) TO authenticated;
