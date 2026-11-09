import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { centsInput, money, parseCents } from "@/lib/billing";
import type { EquipmentModel } from "@/lib/equipment";
import { saveEquipmentModel, type EquipmentModelInput } from "@/lib/equipment-models";
import { Feedback } from "./Shared";

type Draft = { name: string; sale: string; loan: string; replacement: string; active: boolean };
const EMPTY: Draft = { name: "", sale: "", loan: "", replacement: "", active: true };
const toDraft = (model: EquipmentModel): Draft => ({
  name: model.name,
  sale: centsInput(model.sale_cents),
  loan: centsInput(model.loan_monthly_cents),
  replacement: centsInput(model.replacement_cents),
  active: model.active,
});

/** Catálogo de impressoras (SQL 35). Valores valem para contratos novos; os já gerados não mudam. */
export function EquipmentCatalogCard({
  models,
  installed,
  onSaved,
}: {
  models: EquipmentModel[];
  installed: boolean;
  onSaved: (before: EquipmentModel | null, after: EquipmentModel) => Promise<void>;
}) {
  const [editing, setEditing] = useState<EquipmentModel | "novo" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const start = (model: EquipmentModel | "novo") => {
    setDraft(model === "novo" ? EMPTY : toDraft(model));
    setError("");
    setNotice("");
    setEditing(model);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !editing) return;
    const values: Partial<EquipmentModelInput> = { name: draft.name.trim(), active: draft.active };
    for (const [key, label, text] of [
      ["sale_cents", "preço de venda", draft.sale],
      ["loan_monthly_cents", "adicional mensal de comodato", draft.loan],
      ["replacement_cents", "valor de reposição", draft.replacement],
    ] as const) {
      const cents = parseCents(text);
      if (cents === null) {
        setError(`Informe o ${label} em reais, ex.: 1.290,00 (use 0 quando não se aplica).`);
        return;
      }
      values[key] = cents;
    }
    if (values.name!.length < 2) {
      setError("Informe o nome do modelo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const before = editing === "novo" ? null : editing;
      const saved = await saveEquipmentModel(before?.id ?? null, values as EquipmentModelInput);
      await onSaved(before, saved);
      setEditing(null);
      setNotice(before ? "Impressora atualizada." : "Impressora cadastrada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a impressora.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Impressoras</h2>
      <p className="mt-1 text-xs text-muted-foreground">Comodato ou venda junto do plano</p>
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="clients-toolbar mt-4 space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Modelo</span>
              <input
                className="mt-1"
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            {(
              [
                ["sale", "Preço de venda (por unidade)"],
                ["loan", "Adicional de comodato (por mês, por unidade)"],
                ["replacement", "Valor de reposição (por unidade)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-medium">{label}</span>
                <input
                  className="mt-1"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="flex items-center gap-3 self-end text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Disponível para novas assinaturas
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            O valor de reposição é cobrado se um aparelho em comodato for danificado ou não for
            devolvido. Mudanças valem para contratos gerados a partir de agora.
          </p>
          <Feedback error={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar impressora"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {models.length ? (
            <ul className="mt-4 divide-y">
              {models.map((model) => (
                <li
                  key={model.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {model.name}
                      {!model.active && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · desativada
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Venda {money(model.sale_cents)} · comodato {money(model.loan_monthly_cents)}
                      /mês · reposição {money(model.replacement_cents)}
                    </p>
                  </div>
                  {installed && (
                    <Button variant="ghost" onClick={() => start(model)}>
                      Editar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            installed && (
              <p className="mt-4 text-sm text-muted-foreground">Nenhuma impressora cadastrada.</p>
            )
          )}
          {notice && (
            <p role="status" className="mt-4 text-sm">
              {notice}
            </p>
          )}
          <div className="mt-4 border-t pt-4">
            {installed ? (
              <Button variant="outline" onClick={() => start("novo")}>
                Nova impressora
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Para cadastrar impressoras, aplique o SQL 35 (impressoras) neste ambiente.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
