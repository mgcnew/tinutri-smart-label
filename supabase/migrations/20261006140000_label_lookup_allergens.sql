-- A consulta pública por QR passa a informar os alérgenos da etiqueta. O tipo de retorno muda, então a função é recriada.
DROP FUNCTION public.get_label_by_token(text);

CREATE FUNCTION public.get_label_by_token(_token text)
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
  issued_at timestamptz,
  allergens text[]
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
         l.label_status, l.label_kind, l.issued_at, l.allergens
  FROM public.issued_labels l
  JOIN public.clients c ON c.id = l.client_id
  WHERE l.public_token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_label_by_token(text) TO anon, authenticated;
