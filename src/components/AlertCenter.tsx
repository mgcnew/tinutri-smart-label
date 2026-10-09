import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Smartphone, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PreferenceRow } from "@/components/PreferenceRow";
import type { AlertCounts } from "@/lib/alert-plan";
import { remainingTime, type ExpiryWindow } from "@/lib/dashboard";
import type { AlertItem } from "@/hooks/use-alerts";
import { disablePush, enablePush, getPushState, registerServiceWorker, type PushState } from "@/lib/push";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linha da sidebar: liga o som dos alertas e mantém a tela acesa. */
export function AlertSoundToggle({ enabled, blocked, onEnable, onDisable }: { enabled: boolean; blocked: boolean; onEnable: () => void; onDisable: () => void }) {
  if (enabled && blocked) return <PreferenceRow icon={<BellRing />} label="Reativar som dos alertas" status="Bloqueado" tone="alert" onClick={onEnable} />;
  return enabled ? (
    <PreferenceRow icon={<Bell />} label="Som dos alertas" status="Ligado" pressed onClick={onDisable} />
  ) : (
    <PreferenceRow icon={<BellOff />} label="Som dos alertas" status="Desligado" pressed={false} onClick={onEnable} />
  );
}

/**
 * Cartão de alertas, visível em qualquer tela enquanto houver etiqueta vencida ou vencendo hoje.
 * Não tem botão de fechar: só some quando as etiquetas recebem baixa.
 */
export function AlertBanner({ counts, items, soonDays, onOpen }: { counts: AlertCounts | null; items: AlertItem[]; soonDays: number; onOpen: (window: ExpiryWindow) => void }) {
  if (!counts || counts.expired + counts.today + counts.soon === 0) return null;
  const grave = counts.expired + counts.today;
  if (grave === 0)
    return (
      <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
        <span>{plural(counts.soon, "etiqueta vence", "etiquetas vencem")} nos próximos {plural(soonDays, "dia", "dias")}.</span>
        <Button variant="outline" size="sm" onClick={() => onOpen("all")}>Ver validades</Button>
      </div>
    );
  const now = new Date();
  return (
    <section role="alert" className={`mb-5 rounded-xl border-2 p-4 ${counts.expired > 0 ? "border-destructive bg-destructive/5" : "border-accent bg-accent/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert className={`mt-0.5 size-6 shrink-0 ${counts.expired > 0 ? "text-destructive" : "text-accent-foreground"}`} />
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              {counts.expired > 0 && plural(counts.expired, "etiqueta vencida", "etiquetas vencidas")}
              {counts.expired > 0 && counts.today > 0 && " · "}
              {counts.today > 0 && `${plural(counts.today, "vence", "vencem")} hoje`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Retire o produto e registre a baixa. Este aviso só some quando todas receberem baixa.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.expired > 0 && <Button size="sm" variant="destructive" onClick={() => onOpen("expired")}>Ver vencidas</Button>}
          {counts.today > 0 && <Button size="sm" variant="outline" onClick={() => onOpen("today")}>Ver as de hoje</Button>}
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-card text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate font-medium">{item.product_name} <span className="font-normal text-muted-foreground">· {item.client_name}</span></span>
              <span className="shrink-0 text-xs font-semibold">{remainingTime(item, now)}</span>
            </li>
          ))}
          {grave > items.length && <li className="px-3 py-2 text-xs text-muted-foreground">e mais {grave - items.length}…</li>}
        </ul>
      )}
    </section>
  );
}

const PUSH_HINT: Partial<Record<PushState, string>> = {
  unsupported: "Este navegador não recebe notificações push.",
  unconfigured: "Notificações push ainda não foram configuradas neste ambiente.",
  "ios-install": "No iPhone, instale o app: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra-o por lá para ativar os avisos.",
  denied: "Você bloqueou as notificações. Libere nas configurações do navegador para este site.",
};

/** Liga os avisos no celular ou computador, mesmo com o app fechado. */
export function PushToggle({ userId }: { userId: string | null }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void registerServiceWorker();
    void getPushState().then(setState);
  }, []);

  if (!state || !userId) return null;
  const hint = PUSH_HINT[state];
  const change = async (action: () => Promise<PushState>) => {
    setBusy(true);
    setError("");
    try {
      setState(await action());
    } catch {
      setError("Não foi possível alterar as notificações. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  if (hint)
    return (
      <div>
        <PreferenceRow icon={<BellOff />} label="Avisos no celular" status="Indisponível" onClick={() => setError(error ? "" : hint)} />
        {error && <p role="status" className="px-3 pb-2 text-xs leading-relaxed text-muted-foreground">{error}</p>}
      </div>
    );
  return (
    <div>
      {state === "on" ? (
        <PreferenceRow icon={<Smartphone />} label="Avisos no celular" status="Ligado" pressed disabled={busy} onClick={() => void change(disablePush)} />
      ) : (
        <PreferenceRow icon={<Smartphone />} label="Avisos no celular" status="Desligado" pressed={false} disabled={busy} onClick={() => void change(() => enablePush(userId))} />
      )}
      {error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
