import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { management, pageResult, type MasterUser } from "@/lib/management";
import { searchPattern, scopeKey, scopeIds } from "@/lib/list-query";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { Button } from "@/components/ui/button";
import { Field } from "./Shared";
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
      {kind === "person" && (
        <p className="text-xs text-muted-foreground">
          Até 50 sugestões. Pesquise pelo nome para localizar outros responsáveis.
        </p>
      )}
      <input
        type="search"
        aria-label={`Pesquisar ${label.toLowerCase()}`}
        placeholder={`Pesquisar ${label.toLowerCase()}`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
      />
      <Field label={label}>
        <SystemSelect
          value={value}
          required={required}
          disabled={disabled || Boolean(listing.error)}
          onChange={(e) => {
            const row = rows.find((item) => item.id === e.target.value);
            setPinned(row);
            onChange(e.target.value);
          }}
        >
          <option value="">{listing.loading ? "Consultando…" : "Selecione"}</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </SystemSelect>
      </Field>
      {listing.error ? (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível carregar as opções.
          <Button variant="ghost" type="button" onClick={listing.reload}>
            Tentar novamente
          </Button>
        </p>
      ) : (
        listing.total > listing.size && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Página {listing.page}</span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                disabled={listing.loading || listing.page <= 1}
                onClick={() => listing.setPage(listing.page - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={listing.loading || listing.page * listing.size >= listing.total}
                onClick={() => listing.setPage(listing.page + 1)}
              >
                Próxima
              </Button>
            </span>
          </div>
        )
      )}
    </div>
  );
}
