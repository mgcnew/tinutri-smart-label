-- Foto opcional na emissão da etiqueta: evidência para auditoria (estado do produto, lote, embalagem).
-- O arquivo fica num bucket privado, dentro da pasta da empresa; a etiqueta guarda só o caminho.
-- Todas as etiquetas de um mesmo item da fila compartilham o mesmo arquivo.

ALTER TABLE public.issued_labels
  ADD COLUMN photo_path TEXT CHECK (photo_path IS NULL OR char_length(photo_path) BETWEEN 10 AND 200);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('label-photos', 'label-photos', false, 2097152, ARRAY['image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A primeira pasta do caminho é o id da empresa: quem enxerga a empresa enxerga e envia as fotos dela.
-- O CASE evita converter para uuid um nome de pasta inválido.
CREATE POLICY "Users view label photos of accessible clients" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'label-photos'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.user_can_access_client(auth.uid(), ((storage.foldername(name))[1])::uuid) ELSE false END
  );

CREATE POLICY "Users upload label photos for accessible clients" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'label-photos'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.user_can_access_client(auth.uid(), ((storage.foldername(name))[1])::uuid)
           AND private.client_is_operational(((storage.foldername(name))[1])::uuid)
      ELSE false END
  );
-- Sem UPDATE nem DELETE para usuários: a foto é evidência e não pode ser trocada depois.
