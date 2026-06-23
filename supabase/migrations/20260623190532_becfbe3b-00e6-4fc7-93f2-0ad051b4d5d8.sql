
-- 1) Novos valores no enum app_role (admin antigo continua valendo como admin_master para compat)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nutricionista';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_cliente';

-- 2) Status da empresa
DO $$ BEGIN
  CREATE TYPE public.client_status AS ENUM ('ativa','inativa','suspensa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status public.client_status NOT NULL DEFAULT 'ativa';

UPDATE public.clients SET status = CASE WHEN active THEN 'ativa'::public.client_status ELSE 'inativa'::public.client_status END;

-- 3) Carteira nutricionista <-> cliente
CREATE TABLE IF NOT EXISTS public.nutritionist_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nutritionist_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nutritionist_user_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutritionist_clients TO authenticated;
GRANT ALL ON public.nutritionist_clients TO service_role;

ALTER TABLE public.nutritionist_clients ENABLE ROW LEVEL SECURITY;

-- 4) Auditoria em products / issued_labels
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.issued_labels
  ADD COLUMN IF NOT EXISTS issued_by_user_id uuid REFERENCES auth.users(id);

-- 5) Activity logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_client_id_created_at_idx ON public.activity_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 6) Funções security definer (usam comparação por texto p/ evitar 'unsafe use of new enum value')
CREATE OR REPLACE FUNCTION private.is_admin_master(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','admin_master')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_nutricionista(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'nutricionista');
$$;

CREATE OR REPLACE FUNCTION private.is_admin_cliente(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'admin_cliente');
$$;

CREATE OR REPLACE FUNCTION private.nutritionist_has_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nutritionist_clients
    WHERE nutritionist_user_id = _user_id AND client_id = _client_id
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _client_id IS NOT NULL AND (
      private.is_admin_master(_user_id)
      OR (SELECT client_id FROM public.profiles WHERE user_id = _user_id) = _client_id
      OR private.nutritionist_has_client(_user_id, _client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.client_is_operational(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND status = 'ativa');
$$;

-- 7) Políticas RLS (drop & recreate consolidadas)

-- clients
DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;
DROP POLICY IF EXISTS "Operators view own client" ON public.clients;
CREATE POLICY "Admin master manages clients" ON public.clients
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view accessible clients" ON public.clients
  FOR SELECT TO authenticated
  USING (private.user_can_access_client(auth.uid(), id));

-- nutritionist_clients
DROP POLICY IF EXISTS "Admin master manages nutritionist carteira" ON public.nutritionist_clients;
DROP POLICY IF EXISTS "Nutricionista views own carteira" ON public.nutritionist_clients;
CREATE POLICY "Admin master manages nutritionist carteira" ON public.nutritionist_clients
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Nutricionista views own carteira" ON public.nutritionist_clients
  FOR SELECT TO authenticated
  USING (nutritionist_user_id = auth.uid());

-- products
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Operators view own active products" ON public.products;
CREATE POLICY "Admin master manages products" ON public.products
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view products of accessible clients" ON public.products
  FOR SELECT TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Nutri and admin cliente manage products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    private.user_can_access_client(auth.uid(), client_id)
    AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()))
  );
CREATE POLICY "Nutri and admin cliente update products" ON public.products
  FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id)
         AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid())))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Nutri and admin cliente delete products" ON public.products
  FOR DELETE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id)
         AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid())));

-- collaborators
DROP POLICY IF EXISTS "Admins manage collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Operators view own active collaborators" ON public.collaborators;
CREATE POLICY "Admin master manages collaborators" ON public.collaborators
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view collaborators of accessible clients" ON public.collaborators
  FOR SELECT TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Nutri and admin cliente insert collaborators" ON public.collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    private.user_can_access_client(auth.uid(), client_id)
    AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()))
  );
CREATE POLICY "Nutri and admin cliente update collaborators" ON public.collaborators
  FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id)
         AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid())))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id));

-- label_settings
DROP POLICY IF EXISTS "Admins manage label settings" ON public.label_settings;
DROP POLICY IF EXISTS "Operators view own label settings" ON public.label_settings;
CREATE POLICY "Admin master manages label settings" ON public.label_settings
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view label settings of accessible clients" ON public.label_settings
  FOR SELECT TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id));

-- issued_labels
DROP POLICY IF EXISTS "Admins issue labels" ON public.issued_labels;
DROP POLICY IF EXISTS "Admins view label history" ON public.issued_labels;
DROP POLICY IF EXISTS "Operators issue labels for own client" ON public.issued_labels;
CREATE POLICY "Admin master views all labels" ON public.issued_labels
  FOR SELECT TO authenticated
  USING (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view labels of accessible clients" ON public.issued_labels
  FOR SELECT TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Users issue labels for accessible clients" ON public.issued_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    issued_by = auth.uid()
    AND private.user_can_access_client(auth.uid(), client_id)
    AND private.client_is_operational(client_id)
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = issued_labels.product_id
        AND p.client_id = issued_labels.client_id
        AND p.active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = issued_labels.responsible_id
        AND c.client_id = issued_labels.client_id
        AND c.active = true
    )
  );

-- profiles: admin master vê todos; usuário vê o próprio; admin_cliente vê os da sua empresa
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile and admins view all" ON public.profiles;
CREATE POLICY "Admin master manages profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (private.is_admin_master(auth.uid()))
  WITH CHECK (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view own or accessible profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_admin_master(auth.uid())
    OR (client_id IS NOT NULL AND private.user_can_access_client(auth.uid(), client_id))
  );
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- activity_logs
CREATE POLICY "Admin master views all activity" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (private.is_admin_master(auth.uid()));
CREATE POLICY "Users view activity of accessible clients" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND private.user_can_access_client(auth.uid(), client_id));
CREATE POLICY "Users insert activity for accessible scope" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      client_id IS NULL
      OR private.user_can_access_client(auth.uid(), client_id)
    )
  );

-- 8) Triggers de auditoria
CREATE OR REPLACE FUNCTION public.set_products_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_products_audit_trg ON public.products;
CREATE TRIGGER set_products_audit_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_products_audit();

CREATE OR REPLACE FUNCTION public.set_issued_label_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.issued_by_user_id := COALESCE(NEW.issued_by_user_id, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_issued_label_user_trg ON public.issued_labels;
CREATE TRIGGER set_issued_label_user_trg
BEFORE INSERT ON public.issued_labels
FOR EACH ROW EXECUTE FUNCTION public.set_issued_label_user();
