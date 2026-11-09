import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { refreshAvatar, removeAvatar, uploadAvatar, useAvatarUrl } from "@/lib/avatar";

/** Foto da pessoa logada (SQL 36), ou a inicial do nome sem foto. */
export function UserAvatar({
  userId,
  name,
  editable = false,
}: {
  userId: string | null | undefined;
  name: string;
  editable?: boolean;
}) {
  const url = useAvatarUrl(userId);
  const failed = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const face = (
    <span className="workspace-avatar shrink-0" aria-hidden="true">
      {url && failed.current !== url ? (
        <img
          src={url}
          alt=""
          onError={() => {
            // Link expirado: tenta um novo uma vez por link.
            if (failed.current === url || !userId) return;
            failed.current = url;
            refreshAvatar(userId);
          }}
        />
      ) : (
        (name || "U").slice(0, 1).toUpperCase()
      )}
    </span>
  );
  if (!editable || !userId) return face;
  const change = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await uploadAvatar(userId, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await removeAvatar(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover a foto.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void change(e)}
      />
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && !busy) setError("");
        }}
      >
        <DropdownMenuTrigger
          className="workspace-avatar-button shrink-0 rounded-full"
          aria-label={url ? "Trocar ou remover sua foto" : "Adicionar sua foto"}
          disabled={busy}
          aria-busy={busy}
        >
          {face}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate font-semibold">{name || "Sua conta"}</span>
            <span className="block text-xs text-muted-foreground">
              {busy ? "Salvando foto…" : "Sua foto aparece só para você, no topo."}
            </span>
          </DropdownMenuLabel>
          {error && (
            <p role="alert" className="px-2 pb-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <Camera />
            {url ? "Trocar foto" : "Adicionar foto"}
          </DropdownMenuItem>
          {url && (
            <DropdownMenuItem onSelect={() => void remove()}>
              <Trash2 />
              Remover foto
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
