import { useCallback, useEffect, useId, useState } from "react";
import { SearchCombobox } from "@/components/ui/search-combobox";
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
  const [frequent, setFrequent] = useState<Product[]>([]);
  // Mais usados: contagem das últimas emissões da empresa, igual em qualquer aparelho.
  useEffect(() => {
    setFrequent([]);
    if (!clientId) return;
    const controller = new AbortController();
    void (async () => {
      const { data: recent, error } = await supabase
        .from("issued_labels")
        .select("product_id")
        .eq("client_id", clientId)
        .not("product_id", "is", null)
        .order("issued_at", { ascending: false })
        .limit(300)
        .abortSignal(controller.signal);
      if (error || !recent) return;
      const counts = new Map<string, number>();
      for (const row of recent)
        if (row.product_id) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id]) => id);
      if (top.length === 0) return;
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("client_id", clientId)
        .eq("active", true)
        .in("id", top)
        .abortSignal(controller.signal);
      if (controller.signal.aborted || !products) return;
      setFrequent(
        top.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p)),
      );
    })();
    return () => controller.abort();
  }, [clientId, revision]);
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
      {!disabled && frequent.length > 0 && (
        <div className="mb-2" role="group" aria-label="Produtos mais usados">
          <p className="mb-1 text-xs text-muted-foreground">Mais usados</p>
          <div className="flex flex-wrap gap-2">
            {frequent.map((product) => (
              <button
                key={product.id}
                type="button"
                className="emit-count"
                aria-pressed={product.id === value}
                onClick={() => {
                  setSelected(product);
                  onChange(product);
                }}
              >
                {product.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <SearchCombobox
        id={id}
        value={value}
        selectedLabel={selected?.id === value ? selected.name : undefined}
        options={rows.map((row) => ({ id: row.id, label: row.name, hint: row.category }))}
        query={query}
        onQueryChange={setQuery}
        onSelect={(productId) => {
          const record = rows.find((row) => row.id === productId) ?? null;
          setSelected(record);
          onChange(record);
        }}
        loading={listing.loading}
        total={listing.total}
        page={listing.page}
        size={listing.size}
        onPageChange={listing.setPage}
        error={listing.error}
        onReload={listing.reload}
        disabled={disabled}
        disabledPlaceholder="Selecione o cliente primeiro"
        placeholder="Buscar produto ou categoria"
      />
      {selectionError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Não foi possível carregar o produto selecionado. Selecione novamente.
        </p>
      )}
    </div>
  );
}
