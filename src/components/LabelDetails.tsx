import { DiscardReasonField } from "@/components/DiscardReasonField";
import { discardReasonName, formatCloseReason, parseCloseReason } from "@/lib/settlement";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, History, LoaderCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  EVENT_NAMES,
  expiryOf,
  type LabelEvent,
  type OperationalLabel,
  type RecentAction,
} from "@/lib/dashboard";

type Props = {
  labelId: string | null;
  action: RecentAction | null;
  revision: number;
  onClose: () => void;
  onSettle: (
    label: OperationalLabel,
    status: "utilizada" | "consumida" | "descartada",
    reason?: string | null,
  ) => Promise<boolean>;
  onReprint: (label: OperationalLabel) => Promise<void>;
};

const PRINT_NAMES: Record<string, string> = {
  preparada: "Aguardando confirmação",
  confirmada: "Impressão confirmada",
  falha: "Falha de impressão",
  cancelada: "Impressão cancelada",
};
const LIFECYCLE_NAMES: Record<string, string> = {
  ativa: "Ativa",
  utilizada: "Utilizada",
  consumida: "Consumida",
  descartada: "Descartada",
  cancelada: "Cancelada",
};

const discardLabel = (value: string | null) => {
  const { code, note } = parseCloseReason(value);
  return code ? `${discardReasonName(code)}${note ? ` — ${note}` : ""}` : "Não informado";
};

export function LabelDetails({ labelId, action, revision, onClose, onSettle, onReprint }: Props) {
  const [label, setLabel] = useState<OperationalLabel | null>(null);
  const [events, setEvents] = useState<LabelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  useEffect(() => {
    if (!labelId) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError(null);
    setEventsError(false);
    setNotice(null);
    setLabel(null);
    setEvents([]);
    void (async () => {
      try {
        const [record, timeline] = await Promise.all([
          supabase
            .from("issued_labels")
            .select("*")
            .eq("id", labelId)
            .abortSignal(controller.signal)
            .maybeSingle(),
          supabase
            .from("label_events")
            .select("*")
            .eq("label_id", labelId)
            .order("created_at", { ascending: false })
            .limit(50)
            .abortSignal(controller.signal),
        ]);
        if (!alive) return;
        if (record.error) throw record.error;
        if (!record.data) {
          setError("Esta etiqueta não está disponível ou você não tem acesso a ela.");
          return;
        }
        setLabel(record.data);
        setEvents(timeline.data ?? []);
        setEventsError(Boolean(timeline.error));
      } catch {
        if (alive) setError("Não foi possível abrir esta etiqueta. Tente novamente.");
      } finally {
        clearTimeout(timeout);
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [labelId, revision, attempt]);

  const settle = async (status: "utilizada" | "consumida" | "descartada") => {
    if (!label || busy) return;
    const reason = status === "descartada" ? formatCloseReason(reasonCode, reasonNote) : null;
    if (status === "descartada" && !reason) { setNotice("Informe o motivo do descarte."); return; }
    setBusy(true);
    setNotice(null);
    try {
      if (await onSettle(label, status, reason)) { setAttempt((value) => value + 1); setDiscarding(false); setReasonCode(""); setReasonNote(""); }
      else setNotice("Não foi possível registrar a baixa. Tente novamente.");
    } catch {
      setNotice("Não foi possível registrar a baixa. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={labelId !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-card p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="pr-6 text-xl">
            {label?.product_name ?? "Detalhes da etiqueta"}
          </DialogTitle>
          <DialogDescription>
            {label?.client_name ?? "Consulte os dados e os registros desta etiqueta."}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Consultando o registro…
          </p>
        ) : error ? (
          <div role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          label && (
            <>
              {action && (
                <div className="rounded-xl border border-primary/20 bg-secondary/40 p-3 text-sm">
                  <strong>{action.user_name ?? "Usuário não identificado"}</strong>{" "}
                  {EVENT_NAMES[action.event_type] ?? "registrou uma ação"}.
                  <time className="mt-1 block text-xs text-muted-foreground">
                    {format(new Date(action.created_at), "dd/MM/yyyy 'às' HH:mm")}
                  </time>
                </div>
              )}
              <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2">
                {[
                  [
                    "Validade",
                    Number.isFinite(expiryOf(label).getTime())
                      ? format(expiryOf(label), "dd/MM/yyyy HH:mm")
                      : "Não informada",
                  ],
                  [
                    "Situação",
                    `${LIFECYCLE_NAMES[label.label_status]}${label.label_status === "ativa" && expiryOf(label).getTime() <= Date.now() ? " · Vencida" : ""}`,
                  ],
                  ["Lote", label.lot_number ?? "Não informado"],
                  ["Responsável", label.responsible_name],
                  ["Conservação", label.storage_condition ?? "Não informada"],
                  ["Setor", label.sector ?? "Não informado"],
                  ["Impressão", PRINT_NAMES[label.print_status]],
                  ["Emitida em", format(new Date(label.issued_at), "dd/MM/yyyy HH:mm")],
                  ["Inspeção", label.inspection_label ?? "Não informada"],
                  ["Reimpressões", String(label.reprint_count)],
                  ...(label.label_status === "descartada"
                    ? [["Motivo do descarte", discardLabel(label.closed_reason)]]
                    : []),
                ].map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-xs text-muted-foreground">{term}</dt>
                    <dd className="mt-1 break-words font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {label.label_status === "ativa" && label.print_status === "confirmada" && (
                <div>
                  <p className="mb-2 text-sm font-semibold">Registrar destino do produto</p>
                  <div className="flex flex-wrap gap-2">
                    {(["utilizada", "consumida", "descartada"] as const).map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        disabled={busy}
                        onClick={() => (status === "descartada" ? setDiscarding(true) : void settle(status))}
                      >
                        {LIFECYCLE_NAMES[status]}
                      </Button>
                    ))}
                  </div>
                  {discarding && (
                    <div>
                      <DiscardReasonField code={reasonCode} note={reasonNote} onCode={setReasonCode} onNote={setReasonNote} disabled={busy} />
                      <Button className="mt-3" disabled={busy || !formatCloseReason(reasonCode, reasonNote)} onClick={() => void settle("descartada")}>
                        Confirmar descarte
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {notice && (
                <p role="alert" className="text-sm text-destructive">
                  {notice}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onReprint(label);
                      onClose();
                    } catch {
                      setNotice("Não foi possível reimprimir esta etiqueta.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Printer /> Reimprimir
                </Button>
                <Button variant="ghost" asChild>
                  <a
                    href={`/label/${label.public_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink /> Consulta por QR Code
                  </a>
                </Button>
              </div>
              <section className="border-t pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <History className="size-4" /> Linha do tempo
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Últimos 50 registros desta etiqueta.
                </p>
                {eventsError ? (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    Não foi possível consultar a linha do tempo.
                  </p>
                ) : !events.length ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum evento registrado para esta etiqueta.
                  </p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {events.map((event) => (
                      <li
                        key={event.id}
                        className={`rounded-lg border p-3 text-sm ${event.id === action?.id ? "border-primary/40 bg-secondary/40" : ""}`}
                      >
                        <p>
                          <strong>{event.user_name ?? "Usuário não identificado"}</strong>{" "}
                          {EVENT_NAMES[event.event_type] ?? "registrou uma ação"}.
                        </p>
                        <time className="mt-1 block text-xs text-muted-foreground">
                          {format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm")}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
