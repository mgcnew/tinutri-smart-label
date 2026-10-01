import { useId, useState } from "react";
import { Search } from "lucide-react";
import { categoryKey } from "@/lib/categories";

export function EmissionProductPicker({
  products,
  value,
  disabled,
  onChange,
}: {
  products: { id: string; name: string; category: string }[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const visible = products.filter(
    (product) =>
      product.id === value ||
      !query.trim() ||
      categoryKey(`${product.name} ${product.category}`).includes(categoryKey(query)),
  );
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        Produto
      </label>
      {products.length > 6 && (
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
      )}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery("");
        }}
      >
        <option value="">
          {disabled
            ? "Selecione o cliente primeiro"
            : products.length
              ? "Selecione o produto"
              : "Nenhum produto cadastrado"}
        </option>
        {visible.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
      {query && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {visible.length} produto{visible.length === 1 ? "" : "s"} na seleção
        </p>
      )}
    </div>
  );
}
