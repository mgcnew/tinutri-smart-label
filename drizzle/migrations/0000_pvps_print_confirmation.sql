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