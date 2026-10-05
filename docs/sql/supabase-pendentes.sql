-- TiNutri: migrações pendentes para o projeto Tinutrilabel (ylkiyncsqubuxrtwyxwv).
-- Já aplicadas via MCP: initial_schema (20260613141951) e harden_role_functions (20260613142016).
-- Executar inteiro, em ordem, no SQL Editor. Origem: supabase/migrations + drizzle/migrations.

-- ===== 20260613142053_e9e62871-6ccb-42be-85bc-dd52676d992d.sql =====
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

-- ===== 20260613145250_31686532-bac5-4e02-9d1b-f93c57cb583a.sql =====
ALTER TABLE public.clients
  ADD COLUMN legal_name TEXT CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 2 AND 200),
  ADD COLUMN cnpj TEXT CHECK (cnpj IS NULL OR char_length(btrim(cnpj)) BETWEEN 14 AND 20),
  ADD COLUMN city TEXT NOT NULL DEFAULT '' CHECK (char_length(btrim(city)) BETWEEN 0 AND 100),
  ADD COLUMN state TEXT NOT NULL DEFAULT '' CHECK (char_length(btrim(state)) BETWEEN 0 AND 50);

-- ===== 20260623154042_2818fea0-50c6-4723-ad8f-43b8d91364ff.sql =====
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE public.issued_labels ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

-- ===== 20260623164000_a230009d-bb07-4bd3-854e-c4f24613c142.sql =====
DROP POLICY IF EXISTS "Operators issue labels for own client" ON public.issued_labels;

CREATE POLICY "Operators issue labels for own client"
ON public.issued_labels
FOR INSERT
TO authenticated
WITH CHECK (
  issued_by = auth.uid()
  AND client_id = private.current_client_id()
  AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = issued_labels.product_id
      AND p.client_id = issued_labels.client_id
      AND p.active = true
  )
  AND EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.id = issued_labels.responsible_id
      AND c.client_id = issued_labels.client_id
      AND c.active = true
  )
);

-- ===== 20260623190532_becfbe3b-00e6-4fc7-93f2-0ad051b4d5d8.sql =====

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


-- ===== 20260623190550_423218a7-41ef-4cf2-996d-1f147c1bd93f.sql =====

REVOKE EXECUTE ON FUNCTION public.set_products_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_issued_label_user() FROM PUBLIC, anon, authenticated;


-- ===== 20260827232942_ed94a3cd-9911-43f2-863d-6c270176d0c5.sql =====
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS public_code text;

UPDATE public.clients SET public_code = encode(gen_random_bytes(12), 'hex') WHERE public_code IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN public_code SET DEFAULT encode(gen_random_bytes(12), 'hex'),
  ALTER COLUMN public_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_public_code_key ON public.clients (public_code);

CREATE OR REPLACE FUNCTION private.is_gerente(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'gerente');
$$;

DROP POLICY IF EXISTS "Nutri and admin cliente manage products" ON public.products;
CREATE POLICY "Nutri and admin cliente manage products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()) OR private.is_gerente(auth.uid())));

DROP POLICY IF EXISTS "Nutri and admin cliente update products" ON public.products;
CREATE POLICY "Nutri and admin cliente update products" ON public.products
  FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()) OR private.is_gerente(auth.uid())))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id));

DROP POLICY IF EXISTS "Nutri and admin cliente delete products" ON public.products;
CREATE POLICY "Nutri and admin cliente delete products" ON public.products
  FOR DELETE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()) OR private.is_gerente(auth.uid())));

DROP POLICY IF EXISTS "Nutri and admin cliente insert collaborators" ON public.collaborators;
CREATE POLICY "Nutri and admin cliente insert collaborators" ON public.collaborators
  FOR INSERT TO authenticated
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()) OR private.is_gerente(auth.uid())));

DROP POLICY IF EXISTS "Nutri and admin cliente update collaborators" ON public.collaborators;
CREATE POLICY "Nutri and admin cliente update collaborators" ON public.collaborators
  FOR UPDATE TO authenticated
  USING (private.user_can_access_client(auth.uid(), client_id) AND (private.is_nutricionista(auth.uid()) OR private.is_admin_cliente(auth.uid()) OR private.is_gerente(auth.uid())))
  WITH CHECK (private.user_can_access_client(auth.uid(), client_id));

-- ===== 20260827235744_f456295f-8593-4495-8cec-974798033314.sql =====
CREATE TYPE public.label_lifecycle AS ENUM ('ativa','utilizada','consumida','descartada','cancelada');
CREATE TYPE public.label_kind AS ENUM ('manipulado','aberto','fracionado','recebido');

ALTER TABLE public.issued_labels
  ADD COLUMN public_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  ADD COLUMN label_status public.label_lifecycle NOT NULL DEFAULT 'ativa',
  ADD COLUMN label_kind public.label_kind NOT NULL DEFAULT 'aberto',
  ADD COLUMN storage_condition text,
  ADD COLUMN sector text,
  ADD COLUMN location text,
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES auth.users(id),
  ADD COLUMN closed_reason text;

CREATE UNIQUE INDEX issued_labels_public_token_key ON public.issued_labels (public_token);
CREATE INDEX issued_labels_status_expires_idx ON public.issued_labels (label_status, expires_at);

UPDATE public.issued_labels
SET opened_at = COALESCE(opened_at, (opened_on::timestamp AT TIME ZONE 'America/Sao_Paulo')),
    expires_at = COALESCE(expires_at, ((expires_on::timestamp + interval '23 hours 59 minutes') AT TIME ZONE 'America/Sao_Paulo'));

ALTER TABLE public.products
  ADD COLUMN storage_condition text,
  ADD COLUMN label_kind public.label_kind NOT NULL DEFAULT 'aberto';

CREATE POLICY "Users update label status of accessible clients"
ON public.issued_labels FOR UPDATE TO authenticated
USING (private.user_can_access_client(auth.uid(), client_id))
WITH CHECK (private.user_can_access_client(auth.uid(), client_id));

CREATE OR REPLACE FUNCTION public.get_label_by_token(_token text)
RETURNS TABLE (
  id uuid,
  public_token text,
  product_name text,
  client_name text,
  sector text,
  location text,
  opened_at timestamptz,
  expires_at timestamptz,
  storage_condition text,
  lot_number text,
  inspection_label text,
  responsible_name text,
  label_status public.label_lifecycle,
  label_kind public.label_kind,
  issued_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.public_token, l.product_name, c.name, l.sector, l.location,
         COALESCE(l.opened_at, (l.opened_on::timestamp AT TIME ZONE 'America/Sao_Paulo')),
         COALESCE(l.expires_at, (l.expires_on::timestamp AT TIME ZONE 'America/Sao_Paulo')),
         l.storage_condition, l.lot_number, l.inspection_label, l.responsible_name,
         l.label_status, l.label_kind, l.issued_at
  FROM public.issued_labels l
  JOIN public.clients c ON c.id = l.client_id
  WHERE l.public_token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_label_by_token(text) TO anon, authenticated;

-- ===== 0000_pvps_print_confirmation.sql =====
DO $$ BEGIN
  CREATE TYPE public.print_status AS ENUM ('preparada','confirmada','falha','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.issued_labels
  ADD COLUMN IF NOT EXISTS print_status public.print_status NOT NULL DEFAULT 'preparada',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS reprint_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_label_id uuid;

UPDATE public.issued_labels SET print_status = 'confirmada', confirmed_at = COALESCE(confirmed_at, issued_at) WHERE confirmed_at IS NULL AND print_status = 'preparada';

ALTER TABLE public.label_settings ADD COLUMN IF NOT EXISTS expiry_alert_days integer NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS issued_labels_pvps_idx ON public.issued_labels (client_id, print_status, label_status, expires_at);

CREATE TABLE IF NOT EXISTS public.label_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES public.issued_labels(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  user_id uuid,
  user_name text,
  quantity integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.label_events TO authenticated;
GRANT ALL ON public.label_events TO service_role;

ALTER TABLE public.label_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view label events of accessible clients" ON public.label_events
  FOR SELECT TO authenticated USING (private.user_can_access_client(auth.uid(), client_id));

CREATE POLICY "Users insert label events for accessible clients" ON public.label_events
  FOR INSERT TO authenticated WITH CHECK (private.user_can_access_client(auth.uid(), client_id) AND (user_id IS NULL OR user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS label_events_label_idx ON public.label_events (label_id, created_at DESC);
