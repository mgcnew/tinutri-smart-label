import { useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { compressPhoto } from "@/lib/photos";

export type DraftPhoto = { blob: Blob; previewUrl: string };

/** Foto opcional do produto na emissão: abre a câmera traseira no celular e comprime antes de guardar. */
export function LabelPhotoField({
  photo,
  onChange,
  disabled,
}: {
  photo: DraftPhoto | null;
  onChange: (photo: DraftPhoto | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compressPhoto(file);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      onChange({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      setError("Não foi possível usar esta foto. Tente outra.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    onChange(null);
  };

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap justify-between gap-1 text-xs">
        <span className="font-medium">Foto do produto</span>
        <span className="text-muted-foreground">Opcional · fica no histórico da etiqueta</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {photo ? (
        <div className="flex items-center gap-3 rounded-xl border p-2">
          <img
            src={photo.previewUrl}
            alt="Foto do produto"
            className="size-16 shrink-0 rounded-lg object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <Camera /> Trocar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={remove}
            >
              <Trash2 /> Remover
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Camera />}
          {busy ? "Preparando foto…" : "Tirar foto do produto"}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
