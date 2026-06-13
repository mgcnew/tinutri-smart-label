CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id <> auth.uid() THEN false ELSE EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  ) END
$$;
CREATE FUNCTION private.current_client_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_client_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_client_id() TO authenticated;

ALTER POLICY "Admins manage clients" ON public.clients USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Operators view own client" ON public.clients USING (id = private.current_client_id());
ALTER POLICY "Users view own profile and admins view all" ON public.profiles USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Admins manage profiles" ON public.profiles USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Users view own roles" ON public.user_roles USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Admins manage products" ON public.products USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Operators view own active products" ON public.products USING (client_id = private.current_client_id() AND active = true);
ALTER POLICY "Admins manage collaborators" ON public.collaborators USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Operators view own active collaborators" ON public.collaborators USING (client_id = private.current_client_id() AND active = true);
ALTER POLICY "Admins view label history" ON public.issued_labels USING (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Operators issue labels for own client" ON public.issued_labels WITH CHECK (issued_by = auth.uid() AND client_id = private.current_client_id() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.client_id = client_id AND p.active = true) AND EXISTS (SELECT 1 FROM public.collaborators c WHERE c.id = responsible_id AND c.client_id = client_id AND c.active = true));
ALTER POLICY "Admins issue labels" ON public.issued_labels WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Admins manage label settings" ON public.label_settings USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
ALTER POLICY "Operators view own label settings" ON public.label_settings USING (client_id = private.current_client_id());

DROP FUNCTION public.has_role(UUID, public.app_role);
DROP FUNCTION public.current_client_id();