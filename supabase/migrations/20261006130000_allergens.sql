-- Alérgenos de declaração obrigatória (RDC 26/2015): códigos em products.allergens, copiados para a etiqueta emitida
-- para que reimpressões saiam iguais mesmo que o cadastro mude depois.
ALTER TABLE public.products
  ADD COLUMN allergens text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(allergens) <= 12);
ALTER TABLE public.issued_labels
  ADD COLUMN allergens text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(allergens) <= 12);
