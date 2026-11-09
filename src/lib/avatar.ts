import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "avatars";
const SIDE = 256;
const path = (userId: string) => `${userId}/avatar`;

/** Recorta o centro em quadrado e reduz para 256 px; fica na casa de 10–30 KB. */
export async function compressAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIDE, crop);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Imagem indisponível neste navegador.");
  context.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // WebP é menor; navegadores que não o geram devolvem PNG, então cai para JPEG.
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Não foi possível preparar a foto.");
  return jpeg;
}

// Um único estado por usuário, compartilhado pelos avatares da tela (topo, menu do celular).
const urls = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();
const publish = (userId: string, url: string | null) => {
  urls.set(userId, url);
  listeners.forEach((listener) => listener());
};

/** Link temporário da foto, ou null sem foto (ou sem o SQL 36 instalado). */
async function fetchAvatarUrl(userId: string) {
  const { data } = await supabase.storage.from(BUCKET).list(userId, { search: "avatar", limit: 1 });
  if (!data?.some((file) => file.name === "avatar")) return null;
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path(userId), 3600);
  return signed.error ? null : signed.data.signedUrl;
}

export async function uploadAvatar(userId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const photo = await compressAvatar(file);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path(userId), photo, { contentType: photo.type, cacheControl: "60", upsert: true });
  if (error) throw new Error("Não foi possível enviar a foto. Tente novamente.");
  publish(userId, await fetchAvatarUrl(userId));
}

export async function removeAvatar(userId: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path(userId)]);
  if (error) throw new Error("Não foi possível remover a foto. Tente novamente.");
  publish(userId, null);
}

/** O link expira em 1 h: quando a imagem falhar, busca um novo. */
export function refreshAvatar(userId: string) {
  if (pending.has(userId)) return;
  urls.delete(userId);
  listeners.forEach((listener) => listener());
}

export function useAvatarUrl(userId: string | null | undefined) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const known = userId ? urls.has(userId) : true;
  useEffect(() => {
    if (!userId || urls.has(userId) || pending.has(userId)) return;
    const request = fetchAvatarUrl(userId)
      .catch(() => null)
      .then((url) => {
        pending.delete(userId);
        publish(userId, url);
        return url;
      });
    pending.set(userId, request);
  }, [userId, known]);
  return userId ? (urls.get(userId) ?? null) : null;
}
