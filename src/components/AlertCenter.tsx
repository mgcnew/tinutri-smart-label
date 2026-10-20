import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AlertCounts } from "@/lib/alert-plan";
import type { ExpiryWindow } from "@/lib/dashboard";
import {
  disablePush,
  enablePush,
  getPushState,
  registerServiceWorker,
  type PushState,
} from "@/lib/push";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Cartão de alertas, visível em qualquer tela enquanto houver etiqueta vencida ou vencendo hoje.
 * Não tem botão de fechar: só some quando as etiquetas recebem baixa.
 */
export function AlertBanner({
  counts,
  soonDays,
  onOpen,
}: {
  counts: AlertCounts | null;
  soonDays: number;
  onOpen: (window: ExpiryWindow) => void;
}) {
  if (!counts || counts.expired + counts.today + counts.soon === 0) return null;
  const grave = counts.expired + counts.today;
  if (grave === 0)
    return (
      <div
        role="status"
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm"
      >
        <span>
          {plural(counts.soon, "etiqueta vence", "etiquetas vencem")} nos próximos{" "}
          {plural(soonDays, "dia", "dias")}.
        </span>
        <Button variant="outline" size="sm" onClick={() => onOpen("all")}>
          Ver validades
        </Button>
      </div>
    );
  return (
    <section
      role="alert"
      className={`mb-5 rounded-xl border border-l-4 p-4 ${counts.expired > 0 ? "border-destructive/25 border-l-destructive bg-destructive/5" : "border-accent border-l-accent-foreground bg-accent/10"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert
            className={`mt-0.5 size-6 shrink-0 ${counts.expired > 0 ? "text-destructive" : "text-accent-foreground"}`}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tabular-nums">
              {counts.expired > 0 &&
                plural(counts.expired, "etiqueta vencida", "etiquetas vencidas")}
              {counts.expired > 0 && counts.today > 0 && " · "}
              {counts.today > 0 && `${plural(counts.today, "vence", "vencem")} hoje`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {counts.expired > 0
                ? "Retire os produtos vencidos e registre a baixa em Validades."
                : "Confira as etiquetas de hoje e registre a baixa após o uso."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {counts.expired > 0 && (
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              size="sm"
              variant="destructive"
              onClick={() => onOpen("expired")}
            >
              Ver vencidas
            </Button>
          )}
          {counts.today > 0 && (
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              size="sm"
              variant="outline"
              onClick={() => onOpen("today")}
            >
              Ver as de hoje
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export const PUSH_HINT: Partial<Record<PushState, string>> = {
  unsupported: "Este navegador não recebe notificações push.",
  unconfigured: "Notificações push ainda não foram configuradas neste ambiente.",
  "ios-install":
    "No iPhone, instale o app: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra-o por lá para ativar os avisos.",
  denied: "Você bloqueou as notificações. Libere nas configurações do navegador para este site.",
};

/** Estado e ação dos avisos no celular ou computador (funcionam mesmo com o app fechado). */
export function usePush(userId: string | null) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void registerServiceWorker();
    void getPushState().then(setState);
  }, []);

  const toggle = async () => {
    if (!userId || !state) return;
    setBusy(true);
    setError("");
    try {
      setState(state === "on" ? await disablePush() : await enablePush(userId));
    } catch {
      setError("Não foi possível alterar as notificações. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, error, hint: state ? PUSH_HINT[state] : undefined, toggle };
}
