-- Validade por condição de conservação: o mesmo produto dura prazos diferentes refrigerado, congelado etc.
-- Mapa { "<condição de conservação>": dias }. Condição ausente usa shelf_life_days.
ALTER TABLE public.products
  ADD COLUMN shelf_life_by_storage jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(shelf_life_by_storage) = 'object' AND pg_column_size(shelf_life_by_storage) <= 1000);
