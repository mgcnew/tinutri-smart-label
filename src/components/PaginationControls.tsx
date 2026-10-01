import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  label?: string;
};
export function PaginationControls({
  page,
  size,
  total,
  loading,
  onPageChange,
  onSizeChange,
  label = "registros",
}: Props) {
  const id = useId();
  const pages = Math.max(1, Math.ceil(total / size));
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
  return (
    <nav
      aria-label={`Paginação de ${label}`}
      aria-busy={loading}
      className="list-pagination rounded-2xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {loading
            ? "Carregando registros…"
            : total
              ? `Exibindo ${(page - 1) * size + 1}–${Math.min(page * size, total)} de ${total} ${label}`
              : "Nenhum registro encontrado"}
        </p>
        <label htmlFor={id} className="flex items-center gap-2 text-xs text-muted-foreground">
          Por página
          <select
            id={id}
            aria-label="Registros por página"
            value={size}
            disabled={loading}
            onChange={(event) => onSizeChange(Number(event.target.value))}
            className="!w-auto !min-h-11 !py-2"
          >
            {[10, 20, 50].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          Página {page} de {pages}
        </span>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled={loading || page <= 1}
            aria-label="Página anterior"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          {start > 1 && (
            <Button
              variant="ghost"
              size="icon"
              disabled={loading}
              aria-label="Ir para a página 1"
              onClick={() => onPageChange(1)}
            >
              1
            </Button>
          )}
          {start > 2 && (
            <span aria-hidden="true" className="self-center px-1">
              …
            </span>
          )}
          {numbers.map((value) => (
            <Button
              key={value}
              variant={value === page ? "default" : "ghost"}
              className={value === page ? "dashboard-primary" : ""}
              size="icon"
              disabled={loading}
              aria-current={value === page ? "page" : undefined}
              aria-label={`Ir para a página ${value}`}
              onClick={() => onPageChange(value)}
            >
              {value}
            </Button>
          ))}
          {start + numbers.length < pages && (
            <span aria-hidden="true" className="self-center px-1">
              …
            </span>
          )}
          {start + numbers.length <= pages && (
            <Button
              variant="ghost"
              size="icon"
              disabled={loading}
              aria-label={`Ir para a página ${pages}`}
              onClick={() => onPageChange(pages)}
            >
              {pages}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={loading || page >= pages}
            aria-label="Próxima página"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}

export function PageLoading({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? (
    <div role="alert" className="clients-error">
      <p>{error}</p>
      <Button variant="outline" className="mt-3" onClick={retry}>
        Tentar novamente
      </Button>
    </div>
  ) : (
    <div role="status" className="space-y-4 rounded-2xl border bg-card p-5">
      <span className="sr-only">Carregando registros…</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="space-y-2">
          <div className="dashboard-skeleton h-4 w-1/2 rounded" />
          <div className="dashboard-skeleton h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}
