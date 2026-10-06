import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { Download, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import { scopeIds } from "@/lib/list-query";
import { downloadCsv } from "@/lib/management";
import { discardReasonName, parseCloseReason, summarizeLosses } from "@/lib/settlement";

type Loss = { product_name: string; client_name: string; lot_number: string | null; expires_on: string; closed_at: string | null; closed_reason: string | null };

const PAGE = 1000;
const MAX_ROWS = 10000;

/** Descartes do período: o que se perdeu, por quê e quais produtos mais pesam. */
export function LossesDialog({ open, onClose, scopeKey }: { open: boolean; onClose: () => void; scopeKey: string }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Loss[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const ids = scopeIds(scopeKey);
        const since = addDays(new Date(), -days).toISOString();
        const all: Loss[] = [];
        if (ids?.length !== 0) {
          while (all.length < MAX_ROWS) {
            let q = supabase
              .from("issued_labels")
              .select("product_name,client_name,lot_number,expires_on,closed_at,closed_reason")
              .eq("label_status", "descartada")
              .gte("closed_at", since)
              .order("closed_at", { ascending: false })
              .order("id")
              .range(all.length, all.length + PAGE - 1)
              .abortSignal(controller.signal);
            if (ids) q = q.in("client_id", ids);
            const { data, error: queryError } = await q;
            if (queryError) throw queryError;
            all.push(...((data ?? []) as Loss[]));
            if ((data?.length ?? 0) < PAGE) break;
          }
        }
        if (controller.signal.aborted) return;
        setTruncated(all.length >= MAX_ROWS);
        setRows(all);
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível carregar os descartes. Tente novamente.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, days, scopeKey]);

  const summary = summarizeLosses(rows);

  const exportCsv = () =>
    downloadCsv(`descartes-${format(new Date(), "yyyy-MM-dd")}.csv`, [
      ["Empresa", "Produto", "Lote", "Validade", "Descartada em", "Motivo", "Observação"],
      ...rows.map((r) => {
        const { code, note } = parseCloseReason(r.closed_reason);
        return [r.client_name, r.product_name, r.lot_number ?? "", r.expires_on, r.closed_at ? format(new Date(r.closed_at), "dd/MM/yyyy HH:mm") : "", discardReasonName(code), note];
      }),
    ]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="client-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left">
          <DialogTitle>Perdas e descartes</DialogTitle>
          <DialogDescription className="mt-2 text-xs">Etiquetas baixadas como descartadas no período.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <SystemSelect aria-label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </SystemSelect>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Consultando…</p>
          ) : error ? (
            <p role="alert" className="clients-error">{error}</p>
          ) : summary.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum descarte neste período.</p>
          ) : (
            <>
              <p className="text-3xl font-semibold">{summary.total} <span className="text-sm font-normal text-muted-foreground">etiqueta{summary.total === 1 ? "" : "s"} descartada{summary.total === 1 ? "" : "s"}</span></p>
              {truncated && <p className="text-xs text-muted-foreground">Mostrando os {MAX_ROWS.toLocaleString("pt-BR")} descartes mais recentes.</p>}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Por motivo</h3>
                <ul className="space-y-2">
                  {summary.byReason.map((r) => (
                    <li key={r.name} className="text-sm">
                      <div className="flex justify-between gap-3"><span>{r.name}</span><span className="tabular-nums">{r.count} · {Math.round((r.count / summary.total) * 100)}%</span></div>
                      <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden="true"><div className="h-2 rounded-full bg-primary" style={{ width: `${(r.count / summary.total) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Produtos que mais perdem</h3>
                <ol className="space-y-1 text-sm">
                  {summary.byProduct.slice(0, 8).map((p) => (
                    <li key={p.name} className="flex justify-between gap-3"><span className="min-w-0 truncate">{p.name}</span><span className="tabular-nums">{p.count}</span></li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
        <div className="client-dialog-footer shrink-0 border-t px-5 py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button disabled={loading || rows.length === 0} onClick={exportCsv}><Download />Exportar CSV</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
