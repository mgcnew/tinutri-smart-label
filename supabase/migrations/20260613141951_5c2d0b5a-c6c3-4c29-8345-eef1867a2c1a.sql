CREATE TYPE public.app_role AS ENUM ('admin', 'operator');
CREATE TYPE public.inspection_type AS ENUM ('SIF', 'SISP', 'SIM');

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (char_length(btrim(email)) BETWEEN 3 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;

CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators view own client" ON public.clients FOR SELECT TO authenticated
USING (id = public.current_client_id());

CREATE POLICY "Users view own profile and admins view all" ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 2 AND 80),
  shelf_life_days INTEGER NOT NULL CHECK (shelf_life_days BETWEEN 0 AND 3650),
  requires_lot BOOLEAN NOT NULL DEFAULT false,
  requires_inspection BOOLEAN NOT NULL DEFAULT false,
  inspection_type public.inspection_type,
  inspection_number TEXT,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name),
  CHECK (
    (requires_inspection = false AND inspection_type IS NULL AND inspection_number IS NULL)
    OR
    (requires_inspection = true AND inspection_type IS NOT NULL AND char_length(btrim(inspection_number)) BETWEEN 1 AND 40)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators view own active products" ON public.products FOR SELECT TO authenticated
USING (client_id = public.current_client_id() AND active = true);

CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID UNIQUE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  email TEXT CHECK (email IS NULL OR char_length(btrim(email)) BETWEEN 3 AND 255),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaborators TO authenticated;
GRANT ALL ON public.collaborators TO service_role;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage collaborators" ON public.collaborators FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators view own active collaborators" ON public.collaborators FOR SELECT TO authenticated
USING (client_id = public.current_client_id() AND active = true);

CREATE TABLE public.issued_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL,
  issued_by UUID NOT NULL,
  client_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  responsible_name TEXT NOT NULL,
  lot_number TEXT,
  inspection_label TEXT,
  opened_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_on >= opened_on)
);
GRANT SELECT, INSERT ON public.issued_labels TO authenticated;
GRANT ALL ON public.issued_labels TO service_role;
ALTER TABLE public.issued_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view label history" ON public.issued_labels FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators issue labels for own client" ON public.issued_labels FOR INSERT TO authenticated
WITH CHECK (
  issued_by = auth.uid()
  AND client_id = public.current_client_id()
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.client_id = client_id AND p.active = true)
  AND EXISTS (SELECT 1 FROM public.collaborators c WHERE c.id = responsible_id AND c.client_id = client_id AND c.active = true)
);
CREATE POLICY "Admins issue labels" ON public.issued_labels FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.label_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  header_text TEXT NOT NULL DEFAULT 'TiNutri Smart Label®' CHECK (char_length(header_text) BETWEEN 1 AND 80),
  show_logo BOOLEAN NOT NULL DEFAULT true,
  width_mm NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (width_mm BETWEEN 20 AND 120),
  height_mm NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (height_mm BETWEEN 20 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_settings TO authenticated;
GRANT ALL ON public.label_settings TO service_role;
ALTER TABLE public.label_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage label settings" ON public.label_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators view own label settings" ON public.label_settings FOR SELECT TO authenticated
USING (client_id = public.current_client_id());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER collaborators_set_updated_at BEFORE UPDATE ON public.collaborators FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER label_settings_set_updated_at BEFORE UPDATE ON public.label_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX products_client_id_idx ON public.products(client_id);
CREATE INDEX collaborators_client_id_idx ON public.collaborators(client_id);
CREATE INDEX issued_labels_client_issued_at_idx ON public.issued_labels(client_id, issued_at DESC);
CREATE INDEX profiles_client_id_idx ON public.profiles(client_id);