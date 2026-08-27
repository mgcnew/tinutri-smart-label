import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import tinutriLogo from "@/assets/tinutri-logo.png";

export const CLIENT_CODE_KEY = "tinutri.client-code";

export const Route = createFileRoute("/e/$code")({
  head: () => ({
    meta: [
      { title: "Acesso ao estabelecimento | TiNutri Smart Label®" },
      { name: "description", content: "Abra o ambiente do seu estabelecimento no TiNutri Smart Label® e emita etiquetas de validade." },
      { property: "og:title", content: "TiNutri Smart Label®" },
      { property: "og:description", content: "Acesso rápido ao ambiente do seu estabelecimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientEntry,
});

function ClientEntry() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    try { window.localStorage.setItem(CLIENT_CODE_KEY, code); } catch { /* ignore */ }
    void navigate({ to: "/", replace: true });
  }, [code, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div>
        <img src={tinutriLogo} alt="TiNutri" width={56} height={56} className="mx-auto size-14 object-contain" />
        <h1 className="mt-4 text-xl font-bold">Abrindo seu estabelecimento…</h1>
        <p className="mt-2 text-sm text-muted-foreground">Faça login para continuar.</p>
      </div>
    </main>
  );
}
