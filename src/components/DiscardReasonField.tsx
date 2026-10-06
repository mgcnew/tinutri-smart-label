import { SystemSelect } from "@/components/ui/system-select";
import { DISCARD_REASONS, NOTE_MAX } from "@/lib/settlement";

/** Motivo obrigatório do descarte; "Outro" pede uma descrição curta. */
export function DiscardReasonField({
  code,
  note,
  onCode,
  onNote,
  disabled,
}: {
  code: string;
  note: string;
  onCode: (code: string) => void;
  onNote: (note: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      <label className="block text-xs font-medium">
        Motivo do descarte
        <SystemSelect className="mt-1" value={code} disabled={disabled} onChange={(e) => onCode(e.target.value)}>
          <option value="">Selecione o motivo</option>
          {DISCARD_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </SystemSelect>
      </label>
      {code === "outro" && (
        <input
          aria-label="Descreva o motivo"
          maxLength={NOTE_MAX}
          disabled={disabled}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Descreva o motivo"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
