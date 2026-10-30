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
  const expired = counts.expired > 0;
  return (
    <section
      role="alert"
      className={`alert-strip ${expired ? "alert-strip--bad" : "alert-strip--warn"}`}
    >
      <TriangleAlert className="alert-strip__icon" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold tabular-nums">
          {expired && plural(counts.expired, "etiqueta vencida", "etiquetas vencidas")}
          {expired && counts.today > 0 && " · "}
          {counts.today > 0 && `${plural(counts.today, "vence", "vencem")} hoje`}
        </h2>
        <p className="alert-strip__note mt-0.5 text-xs">
          {expired
            ? "Retire os produtos vencidos e registre a baixa em Validades."
            : "Confira as etiquetas de hoje e registre a baixa após o uso."}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {expired && (
          <Button
            className="min-h-11"
            size="sm"
            variant="destructive"
            onClick={() => onOpen("expired")}
          >
            Ver vencidas
          </Button>
        )}
        {counts.today > 0 && (
          <Button
            className={`min-h-11 ${expired ? "alert-strip__secondary" : ""}`}
            size="sm"
            variant="outline"
            onClick={() => onOpen("today")}
          >
            Ver as de hoje
          </Button>
        )}
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
