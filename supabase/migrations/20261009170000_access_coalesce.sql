-- user_can_access_client devolvia NULL (e não falso) para quem não tem perfil ativo.
-- NULL já negava nas regras de linha, mas "NOT NULL" também é NULL e pode passar despercebido em verificações com IF.
CREATE OR REPLACE FUNCTION private.user_can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    _client_id IS NOT NULL AND (
      private.is_admin_master(_user_id)
      OR (SELECT client_id FROM public.profiles WHERE user_id = _user_id AND active) = _client_id
      OR private.nutritionist_has_client(_user_id, _client_id)
    ),
    false);
$$;
