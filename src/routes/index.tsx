import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

import { SystemLanding } from "@/components/landing/SystemLanding";
import { hasSessionHint } from "@/lib/session-hint";
import { workspaceSearch } from "@/lib/workspace-search";

// Visitantes recebem a apresentação já renderizada no servidor; a estação (emissão, impressão,
// painéis) vira um arquivo à parte, baixado só por quem tem sessão salva neste navegador.
const Workspace = lazy(() =>
  import("@/components/workspace/Workspace").then((m) => ({ default: m.Workspace })),
);

export const Route = createFileRoute("/")({
  validateSearch: workspaceSearch,
  head: () => ({
    meta: [
      { title: "TiNutri Smart Label® | Emitir Etiqueta" },
      {
        name: "description",
        content: "Emita etiquetas térmicas padronizadas de identificação e validade de alimentos.",
      },
      { property: "og:title", content: "TiNutri Smart Label®" },
      {
        property: "og:description",
        content: "Identificação e validade de alimentos em poucos toques.",
      },
    ],
  }),
  component: Index,
});

function StationLoading({ className }: { className?: string }) {
  return (
    <main className={`min-h-screen place-items-center bg-background ${className ?? "grid"}`}>
      <p className="font-semibold text-muted-foreground">Preparando sua estação…</p>
    </main>
  );
}

function Index() {
  // O primeiro render repete o HTML do servidor (apresentação); o efeito troca para a estação.
  // Com sessão salva, o CSS esconde a apresentação desde a primeira pintura, sem piscar.
  const [station, setStation] = useState(false);
  useEffect(() => setStation(hasSessionHint()), []);

  if (station)
    return (
      <Suspense fallback={<StationLoading />}>
        <Workspace />
      </Suspense>
    );
  return (
    <>
      <StationLoading className="session-boot" />
      <div className="session-landing">
        <SystemLanding />
      </div>
    </>
  );
}
