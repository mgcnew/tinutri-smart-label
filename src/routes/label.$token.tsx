import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";

import tinutriLogo from "@/assets/tinutri-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { kindLabel, resolveStatus, STATUS_TEXT, type LabelKind, type LabelLifecycle, type LabelStatus } from "@/lib/label";

export const Route = createFileRoute("/label/$token")({
  head: () => ({
    meta: [
      { title: "Consulta de etiqueta | TiNutri Smart Label®" },
      { name: "description", content: "Consulte produto, validade, conservação e situação atual da etiqueta de alimento emitida no TiNutri Smart Label®." },
      { property: "og:title", content: "Consulta de etiqueta | TiNutri Smart Label®" },
      { property: "og:description", content: "Produto, validade, conservação e situação atual da etiqueta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LabelLookup,
});

type LabelRow = {
  id: string;
  public_token: string;
  product_name: string;
  client_name: string;
  sector: string | null;
  location: string | null;
  opened_at: string;
  expires_at: string;
  storage_condition: string | null;
  lot_number: string | null;
  inspection_label: string | null;
  responsible_name: string;
  label_status: LabelLifecycle;
  label_kind: LabelKind;
  issued_at: string;
};

const STATUS_STYLE: Record<LabelStatus, string> = {
  no_prazo: "bg-primary text-primary-foreground",
  proximo: "bg-accent text-accent-foreground",
  vencido: "bg-destructive text-destructive-foreground",
  utilizada: "bg-muted text-muted-foreground",
  consumida: "bg-muted text-muted-foreground",
  descartada: "bg-muted text-muted-foreground",
  cancelada: "bg-muted text-muted-foreground",
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd/MM/yyyy HH:mm");
}

function LabelLookup() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<LabelRow | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc("get_label_by_token", { _token: token });
      if (!alive) return;
      const found = (data as LabelRow[] | null)?.[0] ?? null;
      if (error || !found) { setState("missing"); return; }
      setRow(found);
      setState("ready");
    })();
    return () => { alive = false; };
  }, [token]);

  if (state === "loading") {
    return <main className="grid min-h-screen place-items-center bg-background p-6"><p className="font-semibold text-muted-foreground">Consultando etiqueta…</p></main>;
  }

  if (state === "missing" || !row) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div>
          <img src={tinutriLogo} alt="TiNutri" width={56} height={56} className="mx-auto size-14 object-contain" />
          <h1 className="mt-4 text-xl font-bold">Etiqueta não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">O código lido não corresponde a nenhuma etiqueta emitida.</p>
        </div>
      </main>
    );
  }

  const status = resolveStatus(row.label_status, row.expires_at);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <article className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3">
          <img src={tinutriLogo} alt="TiNutri" width={44} height={44} className="size-11 shrink-0 object-contain" />
          <div className="min-w-0">
            <strong className="block font-display text-base leading-tight">TiNutri Smart Label®</strong>
            <span className="text-xs text-muted-foreground">Consulta de rastreabilidade</span>
          </div>
        </header>

        <section className="mt-5 rounded-3xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{kindLabel(row.label_kind)}</p>
          <h1 className="mt-1 text-2xl font-bold uppercase leading-tight">{row.product_name}</h1>
          <p className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide ${STATUS_STYLE[status]}`}>
            {STATUS_TEXT[status]}
          </p>

          <dl className="mt-5 space-y-3 text-sm">
            <Row term="Estabelecimento" value={row.client_name} />
            <Row term="Setor" value={row.sector ?? "—"} />
            <Row term="Manipulação / abertura" value={fmt(row.opened_at)} />
            <Row term="Validade" value={fmt(row.expires_at)} strong />
            <Row term="Conservação" value={row.storage_condition ?? "—"} />
            <Row term="Lote" value={row.lot_number ?? "—"} />
            {row.inspection_label && <Row term="Inspeção" value={row.inspection_label} />}
            <Row term="Responsável" value={row.responsible_name} />
            <Row term="Localização atual" value={row.location ?? "Não informada"} />
            <Row term="Emitida em" value={fmt(row.issued_at)} />
          </dl>
        </section>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Situação calculada com base na validade registrada. Código {row.public_token.slice(0, 8)}…
        </p>
      </article>
    </main>
  );
}

function Row({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className={`min-w-0 text-right ${strong ? "text-lg font-extrabold text-primary" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
