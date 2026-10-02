import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { searchColumns } from "@/lib/list-query";
import type { Database } from "@/integrations/supabase/types";
type Product = Database["public"]["Tables"]["products"]["Row"];

export function EmissionProductPicker({
  clientId,
  value,
  disabled,
  revision,
  onChange,
  onRecord,
}: {
  clientId: string;
  value: string;
  disabled: boolean;
  revision: number;
  onChange: (product: Product | null) => void;
  onRecord: (product: Product | null) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectionError, setSelectionError] = useState(false);
  const term = useDebouncedValue(query.trim());
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      if (!clientId) return { rows: [], total: 0 };
      let q = supabase
        .from("products")
        .select("*", { count: "exact" })
        .eq("client_id", clientId)
        .eq("active", true)
        .order("name")
        .order("id")
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (term) q = q.or(searchColumns(["name", "category"], term));
      const { data, count, error } = await q;
      if (error || count === null) throw error ?? new Error("Contagem indisponível");
      return { rows: data ?? [], total: count };
    },
    [clientId, term],
  );
  const listing = usePaginatedQuery(JSON.stringify([clientId, term]), load, revision);
  // Keep the selected snapshot while searching other pages. Duplication may reference
  // a product outside the first page, so retrieve that one by id.
  useEffect(() => {
    if (!value || !clientId) {
      setSelected(null);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setSelectionError(false);
    void supabase
      .from("products")
      .select("*")
      .eq("id", value)
      .eq("client_id", clientId)
      .eq("active", true)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setSelected(error ? null : data);
        setSelectionError(Boolean(error || !data));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [value, clientId, revision]);
  useEffect(() => {
    onRecord(selected);
  }, [selected, onRecord]);
  const rows =
    selected && selected.id === value && !listing.rows.some((row) => row.id === value)
      ? [selected, ...listing.rows]
      : listing.rows;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        Produto
      </label>
      <div className="relative mb-2">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Buscar produto para emissão"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-10"
          placeholder="Buscar por produto ou categoria"
          disabled={disabled}
        />
      </div>
      <SystemSelect
        id={id}
        value={value}
        disabled={disabled || Boolean(listing.error)}
        onChange={(event) => {
          const record = rows.find((row) => row.id === event.target.value) ?? null;
          setSelected(record);
          onChange(record);
        }}
      >
        <option value="">
          {disabled
            ? "Selecione o cliente primeiro"
            : listing.loading
              ? "Consultando produtos…"
              : listing.total
                ? "Selecione o produto"
                : "Nenhum produto encontrado"}
        </option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </SystemSelect>
      {selectionError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Não foi possível carregar o produto selecionado. Selecione novamente.
        </p>
      )}
      {listing.error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {listing.error}
          <Button variant="ghost" className="mt-1 text-xs" onClick={listing.reload}>
            Tentar novamente
          </Button>
        </p>
      ) : (
        !disabled && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span role="status">
              {listing.loading
                ? "Consultando produtos…"
                : `${listing.total} produto${listing.total === 1 ? "" : "s"} · Página ${listing.page} de ${Math.max(1, Math.ceil(listing.total / listing.size))}`}
            </span>
            {listing.total > listing.size && (
              <span className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={listing.loading || listing.page === 1}
                  onClick={() => listing.setPage(listing.page - 1)}
                  aria-label="Produtos anteriores"
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={listing.loading || listing.page * listing.size >= listing.total}
                  onClick={() => listing.setPage(listing.page + 1)}
                  aria-label="Próximos produtos"
                >
                  Próximos
                </Button>
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}
