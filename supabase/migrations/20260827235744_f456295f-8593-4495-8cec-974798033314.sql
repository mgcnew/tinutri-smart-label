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