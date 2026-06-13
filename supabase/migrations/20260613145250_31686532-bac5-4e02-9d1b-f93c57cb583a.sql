ALTER TABLE public.clients
  ADD COLUMN legal_name TEXT CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 2 AND 200),
  ADD COLUMN cnpj TEXT CHECK (cnpj IS NULL OR char_length(btrim(cnpj)) BETWEEN 14 AND 20),
  ADD COLUMN city TEXT NOT NULL DEFAULT '' CHECK (char_length(btrim(city)) BETWEEN 0 AND 100),
  ADD COLUMN state TEXT NOT NULL DEFAULT '' CHECK (char_length(btrim(state)) BETWEEN 0 AND 50);