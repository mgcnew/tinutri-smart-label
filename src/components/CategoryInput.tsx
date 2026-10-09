import { useId, useState, type KeyboardEvent } from "react";
import { Check, Plus } from "lucide-react";

import { categoryKey } from "@/lib/categories";

/** Categoria textual do produto: sugestões da empresa e criação no mesmo campo. */
export function CategoryInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const text = value.trim();
  const existing = options.find((option) => categoryKey(option) === categoryKey(text));
  const matches = options.filter((option) => categoryKey(option).includes(categoryKey(text)));
  const canCreate = text.length >= 2 && text.length <= 80 && !existing;
  const choices = [
    ...matches.map((name) => ({ name, create: false })),
    ...(canCreate ? [{ name: text, create: true }] : []),
  ];
  const choose = (index: number) => {
    const choice = choices[index];
    if (!choice) return;
    onChange(choice.name);
    setOpen(false);
    setAnnouncement(
      choice.create
        ? `Categoria ${choice.name} será cadastrada ao salvar o produto.`
        : `Categoria ${choice.name} selecionada.`,
    );
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((previous) =>
        !open
          ? 0
          : choices.length
            ? (previous + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length
            : 0,
      );
    } else if (event.key === "Enter" && open && choices.length) {
      event.preventDefault();
      choose(Math.min(active, choices.length - 1));
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        Categoria *
      </label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && !disabled}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && choices.length
            ? `${id}-option-${Math.min(active, choices.length - 1)}`
            : undefined
        }
        aria-describedby={`${id}-help`}
        required
        minLength={2}
        maxLength={80}
        value={value}
        disabled={disabled}
        placeholder={disabled ? "Selecione a empresa primeiro" : "Escolha ou digite uma categoria"}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={keyDown}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
          setAnnouncement("");
        }}
      />
      {open && !disabled && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label="Categorias da empresa"
          className="category-options mt-2 max-h-44 overflow-y-auto rounded-xl border bg-card p-1"
        >
          {choices.map((choice, index) => (
            <button
              id={`${id}-option-${index}`}
              key={`${choice.create ? "new" : "existing"}-${choice.name}`}
              type="button"
              role="option"
              aria-selected={active === index}
              tabIndex={-1}
              className="category-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {choice.create ? (
                <Plus className="size-4 shrink-0" />
              ) : (
                <Check
                  className={`size-4 shrink-0 ${existing === choice.name ? "" : "opacity-0"}`}
                />
              )}
              <span>{choice.create ? `Criar categoria “${choice.name}”` : choice.name}</span>
            </button>
          ))}
          {!choices.length && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {options.length
                ? "Digite pelo menos 2 caracteres para criar uma categoria."
                : "Nenhuma categoria cadastrada. Digite o nome da primeira."}
            </p>
          )}
        </div>
      )}
      <p id={`${id}-help`} className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Categorias pertencem à empresa selecionada. Novas categorias são salvas com o produto.
      </p>
      {announcement && (
        <p role="status" className="mt-2 text-xs text-primary">
          {announcement}
        </p>
      )}
    </div>
  );
}
