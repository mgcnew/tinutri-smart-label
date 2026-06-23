ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE public.issued_labels ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;