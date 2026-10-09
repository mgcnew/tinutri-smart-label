-- Retenção das fotos de etiqueta: lista os arquivos mais antigos que o prazo, referenciados ou não.
-- A remoção em si é feita pela Edge Function purge-label-photos pela API do Storage: apagar a linha por SQL
-- não remove o arquivo de verdade. A etiqueta mantém o caminho, e a tela avisa que a foto foi removida.
CREATE FUNCTION public.label_photos_to_purge(_days integer DEFAULT 90, _limit integer DEFAULT 500)
RETURNS TABLE (name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'label-photos'
    AND o.created_at < now() - make_interval(days => GREATEST(_days, 30))
  ORDER BY o.created_at
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
$$;
REVOKE ALL ON FUNCTION public.label_photos_to_purge(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.label_photos_to_purge(integer, integer) TO service_role;
