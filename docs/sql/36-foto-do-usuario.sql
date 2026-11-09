-- Aplicação manual. Foto de cada usuário no avatar do topo.
-- Bucket privado `avatars`; cada pessoa tem uma pasta com o próprio id e um único arquivo `avatar`.
-- Só a própria pessoa vê, envia, troca e remove a foto; o app mostra por link temporário.A
-- Não cria coluna: a existência do arquivo é o que liga a foto. Não apaga dados.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own avatar" on storage.objects;
create policy "Users read own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
drop policy if exists "Users replace own avatar" on storage.objects;
create policy "Users replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
drop policy if exists "Users remove own avatar" on storage.objects;
create policy "Users remove own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

commit;
