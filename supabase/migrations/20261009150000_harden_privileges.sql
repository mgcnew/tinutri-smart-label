-- Endurecimento de privilégios (revisão de permissões).

-- 1) Perfil: o usuário podia trocar o próprio client_id e, com isso, passar a enxergar outra empresa
--    (user_can_access_client lê profiles.client_id). Agora só o nome é editável pelo próprio usuário;
--    vínculo com empresa e perfil mudam apenas por funções de servidor / master.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name) ON public.profiles TO authenticated;

-- 2) Etiquetas emitidas são evidência: o usuário só pode mexer nas colunas de impressão, baixa e reimpressão.
--    Produto, lote, validade, responsável, foto etc. não mudam depois de emitidos.
REVOKE UPDATE ON public.issued_labels FROM authenticated;
GRANT UPDATE (print_status, confirmed_at, confirmed_by, label_status, closed_at, closed_by, closed_reason, reprint_count)
  ON public.issued_labels TO authenticated;

-- 3) Etiqueta baixada não volta a ficar ativa, e impressão confirmada não é revertida por uma sessão de usuário.
CREATE OR REPLACE FUNCTION private.guard_label_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- rotinas de servidor (sem sessão de usuário) não passam por aqui
  IF OLD.label_status <> 'ativa' AND NEW.label_status IS DISTINCT FROM OLD.label_status THEN
    RAISE EXCEPTION 'Etiqueta já baixada: o status não pode ser alterado.' USING ERRCODE = '42501';
  END IF;
  IF OLD.print_status = 'confirmada' AND NEW.print_status IS DISTINCT FROM OLD.print_status THEN
    RAISE EXCEPTION 'Impressão já confirmada: o status não pode ser revertido.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_label_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_label_update ON public.issued_labels;
CREATE TRIGGER guard_label_update BEFORE UPDATE ON public.issued_labels
  FOR EACH ROW EXECUTE FUNCTION private.guard_label_update();

-- 4) Privilégios que ninguém precisa pelo cliente (as regras de linha já barravam, mas o certo é não conceder).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
