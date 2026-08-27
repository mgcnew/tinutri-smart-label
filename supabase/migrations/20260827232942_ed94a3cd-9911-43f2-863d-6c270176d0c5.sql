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