import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ComboOption = { id: string; label: string; hint?: string | null };

type Props = {
  id?: string;
  value: string;
  /** Nome do item escolhido, mostrado no campo quando a lista está fechada. */
  selectedLabel?: string;
  options: ComboOption[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string, option: ComboOption | null) => void;
  loading: boolean;
  total: number;
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  error?: string | null;
  onReload?: () => void;
  disabled?: boolean;
  placeholder?: string;
  disabledPlaceholder?: string;
  /** Mostra "limpar" no topo da lista quando há item escolhido (filtros e campos opcionais). */
  clearLabel?: string;
  required?: boolean;
};

/**
 * Busca e escolha em um só campo: digitar filtra a lista logo abaixo e tocar num item seleciona.
 * Substitui o par "campo de busca + select", que fazia duas coisas para uma ação só.
 */
export function SearchCombobox({
  id: givenId,
  value,
  selectedLabel,
  options,
  query,
  onQueryChange,
  onSelect,
  loading,
  total,
  page,
  size,
  onPageChange,
  error,
  onReload,
  disabled = false,
  placeholder = "Buscar",
  disabledPlaceholder,
  clearLabel,
  required,
}: Props) {
  const generated = useId();
  const id = givenId ?? generated;
  const listId = `${id}-lista`;
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const canClear = Boolean(clearLabel && value);
  // A linha "limpar" ocupa o índice 0 quando existe; o restante das opções vem depois.
  const entries: (ComboOption | null)[] = canClear ? [null, ...options] : options;
  const pageCount = Math.max(1, Math.ceil(total / size));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const choose = (option: ComboOption | null) => {
    onSelect(option?.id ?? "", option);
    onQueryChange("");
    setOpen(false);
  };
  const openList = () => {
    setOpen(true);
    setActive(
      Math.max(
        0,
        entries.findIndex((entry) => entry?.id === value),
      ),
    );
  };
  const optionId = (entry: ComboOption | null) => `${id}-op-${entry?.id ?? "limpar"}`;

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span role="status">
        {loading
          ? "Consultando…"
          : `${total} resultado${total === 1 ? "" : "s"} · Página ${page} de ${pageCount}`}
      </span>
      {total > size && (
        <span className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Resultados anteriores"
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || page * size >= total}
            onClick={() => onPageChange(page + 1)}
            aria-label="Próximos resultados"
          >
            Próximos
          </Button>
        </span>
      )}
    </div>
  );

  return (
    <div className="min-w-0">
      <div ref={box} className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required}
          aria-activedescendant={
            open && entries[active] !== undefined ? optionId(entries[active]) : undefined
          }
          autoComplete="off"
          type="text"
          value={open ? query : (selectedLabel ?? "")}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={openList}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) return openList();
              setActive((index) =>
                Math.min(
                  Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0),
                  Math.max(entries.length - 1, 0),
                ),
              );
            }
            if (event.key === "Enter" && open && entries[active] !== undefined) {
              event.preventDefault();
              choose(entries[active]);
            }
          }}
          className="pl-10 pr-10"
          placeholder={
            disabled ? (disabledPlaceholder ?? placeholder) : selectedLabel || placeholder
          }
          disabled={disabled || Boolean(error)}
        />
        {required && (
          // Mantém a validação nativa do formulário: sem escolha, o navegador barra o envio apontando para o campo.
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value}
            onChange={() => undefined}
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        )}
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open && !disabled && (
          <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
            <ul
              id={listId}
              role="listbox"
              aria-label="Resultados"
              className="thin-scroll max-h-64 thin-scroll overflow-y-auto overscroll-contain p-1"
            >
              {entries.length === 0 && (
                <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
                  {loading ? "Consultando…" : "Nada encontrado"}
                </li>
              )}
              {entries.map((entry, index) => (
                <li
                  key={entry?.id ?? "limpar"}
                  id={optionId(entry)}
                  role="option"
                  aria-selected={entry ? entry.id === value : false}
                  // pointerdown + preventDefault: escolhe sem o campo perder o foco antes do clique.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    choose(entry);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${index === active ? "bg-secondary" : ""} ${entry ? "" : "text-muted-foreground"}`}
                >
                  {entry ? (
                    <>
                      <span className="min-w-0">
                        <span className="block truncate">{entry.label}</span>
                        {entry.hint && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.hint}
                          </span>
                        )}
                      </span>
                      {entry.id === value && (
                        <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      )}
                    </>
                  ) : (
                    clearLabel
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t px-3 py-2">{footer}</div>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
          {onReload && (
            <Button type="button" variant="ghost" className="mt-1 text-xs" onClick={onReload}>
              Tentar novamente
            </Button>
          )}
        </p>
      ) : (
        !disabled && !open && total > size && <div className="mt-2">{footer}</div>
      )}
    </div>
  );
}
