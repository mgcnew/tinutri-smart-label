-- Fila de impressão em rede: impressoras, agentes locais e trabalhos.
-- O agente (programa no computador do local) não usa login de usuário: autentica com token
-- próprio, guardado apenas como hash, e só enxerga trabalhos da sua empresa.

CREATE TABLE public.printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  model TEXT NOT NULL DEFAULT 'Elgin L42 Pro' CHECK (char_length(btrim(model)) BETWEEN 2 AND 80),
  host TEXT NOT NULL CHECK (host ~ '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$'),
  port INTEGER NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
CREATE INDEX printers_client_id_idx ON public.printers(client_id);
CREATE TRIGGER printers_set_updated_at BEFORE UPDATE ON public.printers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.print_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  token_hash BYTEA NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
CREATE INDEX print_agents_client_id_idx ON public.print_agents(client_id);

CREATE TABLE public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  printer_id UUID NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','imprimindo','enviada','falha','cancelada')),
  payload TEXT NOT NULL CHECK (octet_length(payload) BETWEEN 1 AND 8000000),
  label_ids UUID[] NOT NULL DEFAULT '{}',
  label_count INTEGER NOT NULL DEFAULT 1 CHECK (label_count BETWEEN 1 AND 500),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT CHECK (error IS NULL OR char_length(error) <= 500),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX print_jobs_pending_idx ON public.print_jobs(client_id, created_at) WHERE status IN ('pendente','imprimindo');
CREATE INDEX print_jobs_client_created_idx ON public.print_jobs(client_id, created_at DESC);

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.printers, public.print_agents, public.print_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printers TO authenticated;
-- token_hash nunca é legível pelo navegador.
GRANT SELECT (id, client_id, name, active, last_seen_at, created_at) ON public.print_agents TO authenticated;
GRANT UPDATE (name, active) ON public.print_agents TO authenticated;
GRANT DELETE ON public.print_agents TO authenticated;
GRANT SELECT, INSERT ON public.print_jobs TO authenticated;
GRANT UPDATE (status, finished_at, error) ON public.print_jobs TO authenticated;
GRANT ALL ON public.printers, public.print_agents, public.print_jobs TO service_role;

CREATE OR REPLACE FUNCTION private.can_manage_printing(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.user_can_access_client(_user_id, _client_id)
    AND (private.is_admin_master(_user_id) OR private.is_nutricionista(_user_id)
         OR private.is_admin_cliente(_user_id) OR private.is_gerente(_user_id));
$$;
REVOKE ALL ON FUNCTION private.can_manage_printing(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_printing(uuid, uuid) TO authenticated;

CREATE POLICY "Users view printers of accessible clients" ON public.printers
  FOR SELECT TO authenticated USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Managers insert printers" ON public.printers
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers update printers" ON public.printers
  FOR UPDATE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id))
  WITH CHECK (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers delete printers" ON public.printers
  FOR DELETE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id));

CREATE POLICY "Managers view print agents" ON public.print_agents
  FOR SELECT TO authenticated USING (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers update print agents" ON public.print_agents
  FOR UPDATE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id))
  WITH CHECK (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers delete print agents" ON public.print_agents
  FOR DELETE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id));

CREATE POLICY "Users view print jobs of accessible clients" ON public.print_jobs
  FOR SELECT TO authenticated USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Users enqueue print jobs for accessible clients" ON public.print_jobs
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND status = 'pendente'
    AND private.user_can_access_client(auth.uid(), client_id)
    AND private.client_is_operational(client_id)
    AND EXISTS (SELECT 1 FROM public.printers p WHERE p.id = printer_id AND p.client_id = print_jobs.client_id AND p.active)
  );
-- O usuário só pode cancelar o que ainda não foi enviado à impressora.
CREATE POLICY "Users cancel pending print jobs" ON public.print_jobs
  FOR UPDATE TO authenticated
  USING (status = 'pendente' AND private.user_can_access_client(auth.uid(), client_id))
  WITH CHECK (status = 'cancelada' AND private.user_can_access_client(auth.uid(), client_id));

-- Cria um agente e devolve o token UMA vez; no banco fica só o hash.
CREATE FUNCTION public.create_print_agent(_client_id uuid, _name text)
RETURNS TABLE (agent_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _token text := encode(extensions.gen_random_bytes(32), 'hex');
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_manage_printing(auth.uid(), _client_id) THEN
    RAISE EXCEPTION 'Sem permissão para configurar impressão desta empresa.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.print_agents (client_id, name, token_hash)
  VALUES (_client_id, btrim(_name), extensions.digest(convert_to(_token, 'utf8'), 'sha256'))
  RETURNING id INTO _id;
  RETURN QUERY SELECT _id, _token;
END $$;
REVOKE ALL ON FUNCTION public.create_print_agent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_print_agent(uuid, text) TO authenticated;

-- Resolve o agente pelo token (hash). Nulo se inválido ou inativo.
CREATE FUNCTION private.agent_from_token(_token text)
RETURNS public.print_agents LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT a.* FROM public.print_agents a
  WHERE a.active AND a.token_hash = extensions.digest(convert_to(coalesce(_token, ''), 'utf8'), 'sha256')
$$;
REVOKE ALL ON FUNCTION private.agent_from_token(text) FROM PUBLIC, anon, authenticated;

-- Batimento do agente: registra presença e devolve as impressoras da empresa.
CREATE FUNCTION public.agent_heartbeat(_token text)
RETURNS TABLE (client_id uuid, agent_name text, printer_id uuid, printer_name text, host text, port integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _agent public.print_agents;
BEGIN
  _agent := private.agent_from_token(_token);
  IF _agent.id IS NULL THEN RAISE EXCEPTION 'Token de agente inválido.' USING ERRCODE = '28000'; END IF;
  UPDATE public.print_agents SET last_seen_at = now() WHERE id = _agent.id;
  RETURN QUERY SELECT _agent.client_id, _agent.name, p.id, p.name, p.host, p.port
    FROM public.printers p WHERE p.client_id = _agent.client_id AND p.active;
END $$;

-- Reserva trabalhos pendentes (ou reservas esquecidas há mais de 2 minutos, até 3 tentativas).
CREATE FUNCTION public.agent_claim_jobs(_token text, _limit integer DEFAULT 5)
RETURNS TABLE (job_id uuid, printer_id uuid, host text, port integer, payload text, label_count integer, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _agent public.print_agents;
BEGIN
  _agent := private.agent_from_token(_token);
  IF _agent.id IS NULL THEN RAISE EXCEPTION 'Token de agente inválido.' USING ERRCODE = '28000'; END IF;
  UPDATE public.print_agents SET last_seen_at = now() WHERE id = _agent.id;
  -- Esgotou as tentativas: marca como falha em vez de reservar de novo.
  UPDATE public.print_jobs j SET status = 'falha', finished_at = now(), error = coalesce(j.error, 'Impressora não respondeu.')
    WHERE j.client_id = _agent.client_id AND j.status = 'imprimindo' AND j.claimed_at < now() - interval '2 minutes' AND j.attempts >= 3;
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.print_jobs j
    WHERE j.client_id = _agent.client_id
      AND (j.status = 'pendente' OR (j.status = 'imprimindo' AND j.claimed_at < now() - interval '2 minutes' AND j.attempts < 3))
    ORDER BY j.created_at
    LIMIT least(greatest(_limit, 1), 20)
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.print_jobs j SET status = 'imprimindo', claimed_at = now(), attempts = j.attempts + 1
    FROM picked WHERE j.id = picked.id
    RETURNING j.id, j.printer_id, j.payload, j.label_count, j.attempts
  )
  SELECT upd.id, upd.printer_id, p.host, p.port, upd.payload, upd.label_count, upd.attempts
  FROM upd JOIN public.printers p ON p.id = upd.printer_id
  ORDER BY upd.id;
END $$;

CREATE FUNCTION public.agent_finish_job(_token text, _job_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _agent public.print_agents;
BEGIN
  _agent := private.agent_from_token(_token);
  IF _agent.id IS NULL THEN RAISE EXCEPTION 'Token de agente inválido.' USING ERRCODE = '28000'; END IF;
  UPDATE public.print_jobs
    SET status = CASE WHEN _ok THEN 'enviada' ELSE 'falha' END,
        finished_at = now(),
        error = CASE WHEN _ok THEN NULL ELSE left(coalesce(_error, 'Falha ao enviar para a impressora.'), 500) END
  WHERE id = _job_id AND client_id = _agent.client_id AND status = 'imprimindo';
END $$;

REVOKE ALL ON FUNCTION public.agent_heartbeat(text), public.agent_claim_jobs(text, integer), public.agent_finish_job(text, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_heartbeat(text), public.agent_claim_jobs(text, integer), public.agent_finish_job(text, uuid, boolean, text) TO anon, authenticated;

-- Layouts de etiqueta por empresa (além dos modelos padrão embutidos no app).
CREATE TABLE public.label_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  preset TEXT NOT NULL DEFAULT 'padrao' CHECK (preset IN ('padrao','validade_grande','compacto')),
  options JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
-- No máximo um layout padrão por empresa.
CREATE UNIQUE INDEX label_layouts_one_default_idx ON public.label_layouts(client_id) WHERE is_default;
CREATE INDEX label_layouts_client_id_idx ON public.label_layouts(client_id);
CREATE TRIGGER label_layouts_set_updated_at BEFORE UPDATE ON public.label_layouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.label_layouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.label_layouts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_layouts TO authenticated;
GRANT ALL ON public.label_layouts TO service_role;

CREATE POLICY "Users view layouts of accessible clients" ON public.label_layouts
  FOR SELECT TO authenticated USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Managers insert layouts" ON public.label_layouts
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers update layouts" ON public.label_layouts
  FOR UPDATE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id))
  WITH CHECK (private.can_manage_printing(auth.uid(), client_id));
CREATE POLICY "Managers delete layouts" ON public.label_layouts
  FOR DELETE TO authenticated USING (private.can_manage_printing(auth.uid(), client_id));
