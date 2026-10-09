import { SearchCombobox } from "@/components/ui/search-combobox";
import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { management, pageResult, type MasterUser } from "@/lib/management";
import { searchPattern, scopeKey, scopeIds } from "@/lib/list-query";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
type Option = { id: string; name: string };
export function RemoteSelect({
  label,
  value,
  onChange,
  kind = "company",
  clientId = "",
  scope = null,
  initial,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind?: "company" | "nutri" | "person";
  clientId?: string;
  scope?: string[] | null;
  initial?: Option;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState<Option | undefined>(initial);
  const term = useDebouncedValue(search);
  const key = scopeKey(scope);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      if (kind === "company") {
        const ids = scopeIds(key);
        if (ids?.length === 0) return { rows: [], total: 0 };
        let q = supabase
          .from("clients")
          .select("id,name", { count: "exact" })
          .order("name")
          .order("id")
          .range(offset, offset + size - 1)
          .abortSignal(signal);
        if (ids) q = q.in("id", ids);
        if (term.trim()) q = q.filter("name", "imatch", searchPattern(term));
        const { data, count, error } = await q;
        if (error || count === null) throw error ?? new Error("Count");
        return { rows: data ?? [], total: count };
      }
      if (kind === "nutri") {
        const { data, error } = await management
          .rpc("master_directory", {
            p_kind: "usuarios",
            p_filter: "nutricionista",
            p_search: searchPattern(term),
            p_offset: offset,
            p_limit: size,
          })
          .abortSignal(signal);
        if (error) throw error;
        const result = pageResult<MasterUser>(data);
        return {
          rows: result.rows.map((row) => ({ id: row.user_id, name: row.name })),
          total: result.total,
        };
      }
      if (!clientId) return { rows: [], total: 0 };
      const { data, error } = await management
        .rpc("care_people", { p_client: clientId, p_search: searchPattern(term), p_limit: 50 })
        .abortSignal(signal);
      if (error) throw error;
      const all = (data as unknown as { user_id: string; name: string }[]).map((row) => ({
        id: row.user_id,
        name: row.name,
      }));
      return { rows: all.slice(offset, offset + size), total: all.length };
    },
    [kind, clientId, term, key],
  );
  const listing = usePaginatedQuery(JSON.stringify([kind, clientId, term, key]), load);
  useEffect(() => {
    if (!value) {
      setPinned(undefined);
      return;
    }
    if (initial?.id === value) {
      setPinned(initial);
      return;
    }
    if (kind !== "company") return;
    let alive = true;
    void supabase
      .from("clients")
      .select("id,name")
      .eq("id", value)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setPinned(data);
      });
    return () => {
      alive = false;
    };
  }, [value, initial, kind]);
  const rows =
    pinned?.id === value && !listing.rows.some((row) => row.id === value)
      ? [pinned, ...listing.rows]
      : listing.rows;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      {kind === "person" && (
        <p className="text-xs text-muted-foreground">
          Até 50 sugestões. Pesquise pelo nome para localizar outros responsáveis.
        </p>
      )}
      <SearchCombobox
        id={id}
        value={value}
        selectedLabel={rows.find((row) => row.id === value)?.name}
        options={rows.map((row) => ({ id: row.id, label: row.name }))}
        query={search}
        onQueryChange={setSearch}
        onSelect={(optionId) => {
          setPinned(rows.find((row) => row.id === optionId));
          onChange(optionId);
        }}
        loading={listing.loading}
        total={listing.total}
        page={listing.page}
        size={listing.size}
        onPageChange={listing.setPage}
        error={listing.error ? "Não foi possível carregar as opções." : null}
        onReload={listing.reload}
        disabled={disabled}
        required={required}
        placeholder={`Pesquisar ${label.toLowerCase().replace(/ \*$/, "")}`}
        clearLabel={required ? undefined : "Limpar seleção"}
      />
    </div>
  );
}
