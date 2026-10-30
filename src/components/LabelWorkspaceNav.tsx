import { CalendarClock, History, Printer } from "lucide-react";
import type { WorkspaceTab } from "@/lib/workspace-search";
const views = [
  {
    id: "emit",
    label: "Emitir",
    title: "Emitir etiqueta",
    icon: Printer,
    description: "Prepare uma etiqueta ou monte uma fila para imprimir em lote.",
  },
  {
    id: "validades",
    label: "Validades (PVPS)",
    title: "Validades",
    icon: CalendarClock,
    description: "Priorize o que vence primeiro e registre o destino das etiquetas.",
  },
  {
    id: "history",
    label: "Histórico",
    title: "Histórico",
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
  const current = views.find((view) => view.id === tab);
  return (
    <section className="label-heading mb-6 space-y-5" aria-label="Gestão de etiquetas">
      <header className="dashboard-heading">
        <div>
          {/* No celular a barra inferior já separa as etapas: o título nomeia a etapa aberta. */}
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="hidden lg:inline">Etiquetas</span>
            <span className="lg:hidden">{current?.title ?? "Etiquetas"}</span>
          </h1>
          <p className="label-heading-note mt-2 text-sm text-muted-foreground">
            {current?.description}
          </p>
        </div>
      </header>
      <nav aria-label="Etapas das etiquetas" className="workspace-tabs label-steps">
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
