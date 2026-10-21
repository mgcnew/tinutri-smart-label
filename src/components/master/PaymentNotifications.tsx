import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPaymentNotifications, retryPaymentNotification } from "@/lib/contracting/functions";
import {
  NOTIFICATION_EVENT,
  NOTIFICATION_STATUS,
  NOTIFICATION_RESULT,
} from "@/lib/contracting/notification-domain";
import { Feedback } from "./Shared";

const api = {
  list: (page: number) => listPaymentNotifications({ data: { page } }),
  retry: (id: string) => retryPaymentNotification({ data: { id } }),
};
const when = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
export function PaymentNotifications() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [listing, setListing] = useState<Awaited<ReturnType<typeof api.list>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    setListing(await api.list(page));
  }, [page]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    void api
      .list(page)
      .then((data) => {
        if (alive) setListing(data);
      })
      .catch(() => {
        if (alive) setError("Não foi possível consultar as notificações.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, page]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a conferência.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Notificações de pagamento</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Acompanhe os retornos do Asaas e retome conferências interrompidas.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Ocultar notificações" : "Ver notificações"}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          <Feedback error={error} notice={notice} />
          {loading ? (
            <p role="status" className="text-sm">
              Carregando notificações…
            </p>
          ) : listing && !listing.installed ? (
            <p className="text-sm text-muted-foreground">
              O histórico será disponibilizado após a atualização da estrutura de recebimento. As
              conferências de pagamento existentes continuam disponíveis.
            </p>
          ) : (
            listing && (
              <>
                {!listing.rows.length ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma notificação recebida neste histórico.
                  </p>
                ) : (
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b text-xs text-muted-foreground">
                        <tr>
                          <th className="p-2">Recebida</th>
                          <th className="p-2">Evento</th>
                          <th className="p-2">Situação</th>
                          <th className="relative p-2">
                            <span className="sr-only">Ações</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {listing.rows.map((row) => (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap p-2 align-top text-xs">
                              <time dateTime={row.received_at}>{when(row.received_at)}</time>
                            </td>
                            <td className="p-2 align-top">
                              <span>
                                {Object.hasOwn(NOTIFICATION_EVENT, row.event_type)
                                  ? NOTIFICATION_EVENT[row.event_type]
                                  : "Notificação financeira"}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {row.deliveries} recebimento(s) · {row.attempts} conferência(s)
                              </span>
                            </td>
                            <td className="max-w-72 p-2 align-top">
                              <strong className="text-xs">{NOTIFICATION_STATUS[row.status]}</strong>
                              {row.result_code && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {Object.hasOwn(NOTIFICATION_RESULT, row.result_code)
                                    ? NOTIFICATION_RESULT[row.result_code]
                                    : "Confira os dados antes de continuar."}
                                </p>
                              )}
                            </td>
                            <td className="p-2 align-top">
                              {(row.status === "pending" ||
                                row.status === "blocked" ||
                                (row.status === "processing" &&
                                  row.locked_until &&
                                  Date.parse(row.locked_until) <= Date.now())) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      const result = await api.retry(row.id);
                                      await refresh();
                                      setNotice(
                                        result.state === "completed"
                                          ? "Notificação conferida. A situação do pagamento foi consultada no Asaas."
                                          : result.state === "busy_or_completed"
                                            ? "A notificação já foi concluída ou está sendo conferida."
                                            : "A notificação foi preservada e ainda precisa de conferência.",
                                      );
                                    })
                                  }
                                >
                                  Retomar
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {listing.total} notificação(ões) · Página {page + 1}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || page === 0}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || (page + 1) * 10 >= listing.total}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || loading}
            onClick={() => void run(refresh)}
          >
            <RefreshCw />
            Atualizar notificações
          </Button>
        </div>
      )}
    </section>
  );
}
