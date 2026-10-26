import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OWN_CONSENT, type OwnSignatureSummary, type OwnParty } from "@/lib/contracting/own-domain";
export function OwnSignatureForm({
  summary,
  party,
  onRequest,
  onConfirm,
  onRefresh,
}: {
  summary: OwnSignatureSummary;
  party: OwnParty;
  onRequest: () => Promise<{ state: string }>;
  onConfirm: (challengeId: string, code: string) => Promise<{ state: string }>;
  onRefresh: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const done = party === "client" ? summary.clientAccepted : summary.tinutriAccepted;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a assinatura.");
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <p role="status" className="mt-4 rounded-lg border p-4 text-sm">
        {summary.clientAccepted && summary.tinutriAccepted
          ? "Os dois aceites estão registrados. A finalização do documento está em andamento."
          : party === "client"
            ? "Seu aceite foi registrado. Aguardando a assinatura do representante da TiNutri."
            : "O aceite da TiNutri foi registrado. Aguardando a assinatura do cliente."}
      </p>
    );
  if (!summary.maySign)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        A assinatura da TiNutri deve ser feita pela conta Master com o e-mail do representante
        indicado no contrato.
      </p>
    );
  const active = summary.challenge && Date.parse(summary.challenge.expiresAt) > Date.now();
  return (
    <div className="mt-4 min-w-0 space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {notice}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A assinatura será confirmada aqui por um código enviado ao e-mail indicado no contrato. O
        código é pessoal e vale por dez minutos.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0"
          checked={accepted}
          disabled={busy}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>{OWN_CONSENT}</span>
      </label>
      {active && (
        <div className="space-y-3">
          {summary.challenge?.delivery !== "sent" && (
            <p className="text-sm text-muted-foreground">
              O envio ainda não foi confirmado. Aguarde e atualize a situação; se necessário,
              solicite outro código após o intervalo.
            </p>
          )}
          <label className="block text-sm">
            <span>Código recebido por e-mail</span>
            <input
              aria-label="Código recebido por e-mail"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-2 block min-h-11 w-full max-w-64 rounded-lg border bg-background px-3 text-base tracking-widest"
            />
          </label>
          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={
              busy || !accepted || code.length !== 6 || summary.challenge?.delivery !== "sent"
            }
            onClick={() =>
              void run(async () => {
                const result = await onConfirm(summary.challenge!.id, code);
                setCode("");
                setAccepted(false);
                await onRefresh();
                setNotice(
                  result.state === "signed"
                    ? "Assinatura concluída. O documento está disponível."
                    : result.state === "finalization_pending"
                      ? "Seu aceite foi preservado. A TiNutri concluirá a preparação do comprovante."
                      : "Seu aceite foi registrado.",
                );
              })
            }
          >
            {busy ? "Conferindo…" : "Confirmar assinatura"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={active ? "outline" : "default"}
          className="min-h-11 w-full sm:w-auto"
          disabled={busy || !accepted}
          onClick={() =>
            void run(async () => {
              const result = await onRequest();
              setCode("");
              setAccepted(false);
              await onRefresh();
              setNotice(
                result.state === "sent"
                  ? "Código enviado. Confira seu e-mail e use o código mais recente."
                  : result.state === "accepted"
                    ? "Seu aceite já está registrado."
                    : "O pedido foi preservado, mas o envio ainda não foi confirmado. Atualize a situação em instantes.",
              );
            })
          }
        >
          {busy
            ? "Preparando envio…"
            : active
              ? "Solicitar novo código"
              : "Enviar código de assinatura"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run(onRefresh)}>
          Atualizar assinatura
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Solicitar outro código invalida o anterior. Há um intervalo mínimo de um minuto entre
        envios.
      </p>
    </div>
  );
}
