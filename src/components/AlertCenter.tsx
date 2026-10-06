import { Bell, BellOff, BellRing, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AlertCounts } from "@/lib/alert-plan";
import { remainingTime, type ExpiryWindow } from "@/lib/dashboard";
import type { AlertItem } from "@/hooks/use-alerts";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Botão do cabeçalho: liga o som dos alertas e mantém a tela acesa. */
export function AlertSoundToggle({ enabled, blocked, onEnable, onDisable }: { enabled: boolean; blocked: boolean; onEnable: () => void; onDisable: () => void }) {
  if (enabled && blocked)
    return (
      <Button variant="outline" size="sm" className="border-destructive text-destructive" onClick={onEnable}>
        <BellRing />
        Toque para reativar o som
      </Button>
    );
  return enabled ? (
    <Button variant="ghost" size="sm" onClick={onDisable} aria-label="Desligar som dos alertas e tela ligada">
      <Bell />
      Som ligado
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={onEnable}>
      <BellOff />
      Ativar som
    </Button>
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
