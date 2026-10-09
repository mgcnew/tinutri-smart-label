import { supabase } from "@/integrations/supabase/client";

const BUCKET = "label-photos";
const MAX_SIDE = 1280;

/** Reduz a foto do celular (vários MB) para algo na casa de 100–200 KB, já na orientação correta. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Imagem indisponível neste navegador.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
  // WebP é menor; navegadores que não o geram devolvem PNG, então cai para JPEG.
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Não foi possível preparar a foto.");
  return jpeg;
}

/** Envia para a pasta da empresa no bucket privado e devolve o caminho que a etiqueta vai guardar. */
export async function uploadLabelPhoto(clientId: string, photo: Blob): Promise<string> {
  const extension = photo.type === "image/webp" ? "webp" : "jpg";
  const path = `${clientId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: photo.type, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}

/** Link temporário: a foto nunca é pública. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}
