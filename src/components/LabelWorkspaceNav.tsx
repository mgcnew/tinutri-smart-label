import { CalendarClock, History, Printer } from "lucide-react";
import type { WorkspaceTab } from "@/lib/workspace-search";
const views = [
  {
    id: "emit",
    label: "Emitir",
    icon: Printer,
    description: "Prepare uma etiqueta ou monte uma fila para imprimir em lote.",
  },
  {
    id: "validades",
    label: "Validades (PVPS)",
    icon: CalendarClock,
    description: "Priorize o que vence primeiro e registre o destino das etiquetas.",
  },
  {
    id: "history",
    label: "Histórico",
    icon: History,
    description: "Consulte as emissões, reimprima e exporte os registros da operação.",
  },
] as const;
export function LabelWorkspaceNav({
  tab,
  allowed,
  onNavigate,
}: {
  tab: WorkspaceTab;
  allowed: WorkspaceTab[];
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  return (
    <section className="mb-6 space-y-5" aria-label="Gestão de etiquetas">
      <header className="dashboard-heading">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Etiquetas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {views.find((view) => view.id === tab)?.description}
          </p>
        </div>
      </header>
      <nav aria-label="Etapas das etiquetas" className="workspace-tabs">
        {views
          .filter((view) => allowed.includes(view.id))
          .map((view) => (
            <button
              key={view.id}
              type="button"
              aria-current={tab === view.id ? "page" : undefined}
              onClick={() => onNavigate(view.id)}
            >
              <view.icon aria-hidden="true" />
              {view.label}
            </button>
          ))}
      </nav>
    </section>
  );
}
