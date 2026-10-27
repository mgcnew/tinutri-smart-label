import { format } from "date-fns";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { allergenText } from "@/lib/allergens";
import { qrFor, type LabelKind, type PrintableLabel } from "@/lib/label";
import { loadSettings } from "@/lib/printer-settings";
import { printThermalBatch } from "@/lib/print-thermal";

/** Funções do SQL 32 ainda fora dos tipos gerados do Supabase. */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

export type MoveOption = {
  storage: string;
  days: number | null;
  expires_at: string | null;
  allowed: boolean;
};
type NewLabel = {
  public_token: string;
  label_kind: LabelKind;
  product_name: string;
  opened_on: string;
  opened_at: string | null;
  expires_at: string;
  storage_condition: string;
  sector: string | null;
  lot_number: string | null;
  inspection_label: string | null;
  allergens: string[] | null;
  responsible_name: string;
  issued_at: string;
};

const when = (value: string) => format(new Date(value), "dd/MM/yyyy HH:mm");
/** Mensagens do banco já vêm em português; o resto vira uma orientação genérica. */
const reason = (error: { message?: string } | null) =>
  error?.message &&
  /[ÀÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]|etiqueta|conservação|permissão|validade|produto|local/i.test(
    error.message,
  )
    ? error.message
    : "Não foi possível concluir. Tente novamente.";

/**
 * Ações da equipe pelo QR: mudar o local (só registra) ou a conservação, que gera uma etiqueta nova com a
 * validade pela regra da consultoria (nunca aumenta). A original só é encerrada quando a nova é impressa.
 */
export function LabelMovePanel({
  token,
  location,
  options,
  onChanged,
  expired = false,
}: {
  token: string;
  location: string | null;
  options: MoveOption[];
  onChanged: (replacementToken?: string) => Promise<void>;
  /** Vencida não muda de conservação: a validade nunca aumenta, então o caminho é dar baixa. */
  expired?: boolean;
}) {
  const [place, setPlace] = useState(location ?? "");
  const [chosen, setChosen] = useState<MoveOption | null>(null);
  const [created, setCreated] = useState<NewLabel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const saveLocation = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await rpc("update_label_location", { _token: token, _location: place });
    setBusy(false);
    if (error) return setMessage({ text: reason(error), error: true });
    const state = (data as { state?: string } | null)?.state;
    setMessage({
      text: state === "same" ? "A etiqueta já está neste local." : "Local atualizado.",
      error: false,
    });
    if (state === "moved") await onChanged();
  };

  const print = async (label: NewLabel) => {
    const printable: PrintableLabel = {
      kind: label.label_kind,
      product: label.product_name,
      opened: when(label.opened_at ?? `${label.opened_on}T12:00:00`),
      expires: when(label.expires_at),
      storage: label.storage_condition,
      sector: label.sector ?? undefined,
      lot: label.lot_number ?? undefined,
      inspection: label.inspection_label ?? undefined,
      allergens: allergenText(label.allergens),
      responsible: label.responsible_name,
      issued: new Date(label.issued_at),
      token: label.public_token,
      qrDataUrl: await qrFor(label.public_token),
    };
    if (!printThermalBatch([printable], loadSettings()))
      setMessage({
        text: "Não foi possível abrir a impressão. Confira a impressora e tente de novo.",
        error: true,
      });
  };

  const createReplacement = async () => {
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await rpc("move_label", { _token: token, _storage: chosen.storage });
    setBusy(false);
    if (error) return setMessage({ text: reason(error), error: true });
    const label = (data as { label?: NewLabel } | null)?.label;
    if (!label) return setMessage({ text: "Não foi possível gerar a etiqueta nova.", error: true });
    setCreated(label);
    await print(label);
  };

  const confirmPrinted = async () => {
    if (!created) return;
    setBusy(true);
    setMessage(null);
    const { error } = await rpc("finish_label_move", { _token: created.public_token });
    setBusy(false);
    if (error) return setMessage({ text: reason(error), error: true });
    await onChanged(created.public_token);
  };

  return (
    <section className="mt-4 rounded-3xl border bg-card p-5 shadow-sm" aria-labelledby="move-title">
      <h2 id="move-title" className="text-sm font-bold">
        Mover esta etiqueta
      </h2>

      {created ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            Etiqueta nova gerada para <strong>{created.storage_condition}</strong>, com validade até{" "}
            <strong>{when(created.expires_at)}</strong>. Cole a etiqueta nova na embalagem.
          </p>
          <p className="text-xs text-muted-foreground">
            A etiqueta atual continua valendo até você confirmar a impressão.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              className="min-h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              onClick={() => void confirmPrinted()}
            >
              {busy ? "Confirmando…" : "A etiqueta nova saiu certa"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-12 rounded-xl border text-sm font-semibold"
              onClick={() => void print(created)}
            >
              Imprimir de novo
            </button>
          </div>
        </div>
      ) : (
        <>
          <label
            className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
            htmlFor="move-place"
          >
            Local
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="move-place"
              value={place}
              maxLength={80}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Ex.: Geladeira 2, prateleira de cima"
              className="min-h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base"
            />
            <button
              type="button"
              disabled={busy || !place.trim()}
              className="min-h-12 shrink-0 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
              onClick={() => void saveLocation()}
            >
              Salvar
            </button>
          </div>

          {expired && options.length > 0 && (
            <p className="mt-5 text-sm text-muted-foreground">
              A validade terminou: esta etiqueta não pode mudar de conservação. Dê baixa nela.
            </p>
          )}
          {!expired && options.length > 0 && (
            <fieldset className="mt-5">
              <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Mudar a conservação
              </legend>
              <p className="mt-1 text-xs text-muted-foreground">
                A validade nunca aumenta: vale o menor prazo entre a nova conservação e a validade
                atual.
              </p>
              <div className="mt-2 grid gap-2">
                {options.map((option) => (
                  <button
                    key={option.storage}
                    type="button"
                    disabled={!option.allowed || busy}
                    aria-pressed={chosen?.storage === option.storage}
                    onClick={() => setChosen(option)}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm disabled:opacity-50 ${chosen?.storage === option.storage ? "border-primary bg-primary/5" : ""}`}
                  >
                    <span className="font-semibold">{option.storage}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {option.allowed && option.expires_at
                        ? `até ${when(option.expires_at)}`
                        : "não permitido"}
                    </span>
                  </button>
                ))}
              </div>
              {chosen && (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 min-h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
                  onClick={() => void createReplacement()}
                >
                  {busy ? "Gerando…" : "Gerar e imprimir a etiqueta nova"}
                </button>
              )}
            </fieldset>
          )}
        </>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-3 text-sm font-semibold ${message.error ? "text-destructive" : "text-primary"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
