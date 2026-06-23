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