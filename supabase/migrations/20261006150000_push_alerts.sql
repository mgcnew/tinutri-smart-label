-- Notificações push de validade: inscrições dos aparelhos, controle de envio e a função que
-- decide quem recebe cada aviso. O envio em si é feito pela Edge Function send-alert-push.

CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 20 AND 2000),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth TEXT NOT NULL CHECK (char_length(auth) BETWEEN 10 AND 100),
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
-- A chave de criptografia (p256dh/auth) nunca volta para o navegador; o usuário só vê e remove os aparelhos dele.
GRANT SELECT (id, user_id, endpoint, created_at, user_agent) ON public.push_subscriptions TO authenticated;
GRANT DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
CREATE POLICY "Users view own push subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own push subscriptions" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Registro por função: se outra pessoa já usou este aparelho, a inscrição passa para quem entrou agora.
CREATE FUNCTION public.register_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 200))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
END $$;
REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text) TO authenticated;

-- Cada etiqueta gera, no máximo, um aviso por nível (por vencer, hoje, vencida).
CREATE TABLE public.alert_dispatches (
  label_id UUID NOT NULL REFERENCES public.issued_labels(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('soon', 'today', 'expired')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_id, level)
);
ALTER TABLE public.alert_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_dispatches FROM anon, authenticated;
GRANT ALL ON public.alert_dispatches TO service_role;

-- Reivindica os avisos pendentes e devolve um resumo por usuário. Só considera etiquetas ativas e impressas
-- que tenham ao menos um destinatário inscrito (empresa do perfil ou carteira da nutricionista); sem
-- destinatário nada é marcado como enviado, então o aviso sai quando alguém se inscrever.
CREATE FUNCTION public.claim_alert_digests(_soon_days integer DEFAULT 3)
RETURNS TABLE (user_id uuid, expired integer, today integer, soon integer, sample text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _zone constant text := 'America/Sao_Paulo';
  _now timestamptz := now();
  _eod timestamptz := ((date_trunc('day', now() AT TIME ZONE _zone) + interval '1 day' - interval '1 second') AT TIME ZONE _zone);
  _soon_end timestamptz;
BEGIN
  IF _soon_days IS NULL OR _soon_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Antecedência inválida.'; END IF;
  _soon_end := _eod + make_interval(days => _soon_days);
  RETURN QUERY
  WITH cand AS (
    SELECT l.id AS label_id, l.client_id, l.product_name,
           CASE WHEN x.expiry <= _now THEN 'expired' WHEN x.expiry <= _eod THEN 'today' WHEN x.expiry <= _soon_end THEN 'soon' END AS level
    FROM public.issued_labels l
    CROSS JOIN LATERAL (SELECT COALESCE(l.expires_at, (l.expires_on + time '23:59:59') AT TIME ZONE _zone) AS expiry) x
    WHERE l.print_status = 'confirmada' AND l.label_status = 'ativa' AND x.expiry <= _soon_end
  ),
  fresh AS (
    SELECT c.* FROM cand c
    WHERE c.level IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.alert_dispatches d WHERE d.label_id = c.label_id AND d.level = c.level)
  ),
  recipients AS (
    SELECT DISTINCT s.user_id AS uid, f.label_id, f.level, f.product_name
    FROM fresh f
    CROSS JOIN (SELECT DISTINCT ps.user_id FROM public.push_subscriptions ps) s
    WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = s.user_id AND p.client_id = f.client_id)
       OR EXISTS (SELECT 1 FROM public.nutritionist_clients n WHERE n.nutritionist_user_id = s.user_id AND n.client_id = f.client_id)
  ),
  claimed AS (
    INSERT INTO public.alert_dispatches (label_id, level)
    SELECT DISTINCT r.label_id, r.level FROM recipients r
    ON CONFLICT DO NOTHING
    RETURNING alert_dispatches.label_id, alert_dispatches.level
  )
  SELECT r.uid,
         count(*) FILTER (WHERE r.level = 'expired')::int,
         count(*) FILTER (WHERE r.level = 'today')::int,
         count(*) FILTER (WHERE r.level = 'soon')::int,
         (array_agg(r.product_name ORDER BY CASE r.level WHEN 'expired' THEN 0 WHEN 'today' THEN 1 ELSE 2 END, r.product_name))[1:6]
  FROM recipients r
  JOIN claimed c ON c.label_id = r.label_id AND c.level = r.level
  GROUP BY r.uid;
END $$;
REVOKE ALL ON FUNCTION public.claim_alert_digests(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_alert_digests(integer) TO service_role;
