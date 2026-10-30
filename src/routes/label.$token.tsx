import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";

import tinutriLogo from "@/assets/tinutri-logo-ui.webp";
import { supabase } from "@/integrations/supabase/client";
import { DiscardReasonField } from "@/components/DiscardReasonField";
import { LabelMovePanel, type MoveOption } from "@/components/LabelMovePanel";
import { settleLabelRecord } from "@/lib/settlement-actions";
import { allergenText } from "@/lib/allergens";
import { formatCloseReason, type Settlement } from "@/lib/settlement";
import {
  kindLabel,
  resolveStatus,
  STATUS_TEXT,
  type LabelKind,
  type LabelLifecycle,
  type LabelStatus,
} from "@/lib/label";

/** Funções do SQL 30 ainda fora dos tipos gerados do Supabase. */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

type TimelineEvent = { type: string; at: string; by: string | null };
type Lookup = {
  label: LabelRow;
  events: TimelineEvent[] | null;
  staff: boolean;
  /** Ausentes antes do SQL 32: sem eles, as ações de mover não aparecem. */
  moveOptions?: MoveOption[];
  sourceToken?: string | null;
  replacedByToken?: string | null;
};
type CheckState = "registered" | "recent" | null;
type SameLotLabel = {
  id: string;
  public_token: string;
  product_name: string;
  label_status: LabelLifecycle;
  print_status: string;
  expires_at: string | null;
  expires_on: string;
  location: string | null;
  storage_condition: string | null;
};

const TIMELINE_NAMES: Record<string, string> = {
  emissao: "Etiqueta emitida",
  impressao_confirmada: "Impressão confirmada",
  falha_impressao: "Falha de impressão registrada",
  reimpressao: "Reimpressão solicitada",
  conferencia: "Conferida pela equipe",
  baixa_utilizada: "Baixa: utilizada",
  baixa_consumida: "Baixa: consumida",
  baixa_descartada: "Baixa: descartada",
  movimentacao: "Mudou de local",
  mudanca_conservacao: "Mudança de conservação: etiqueta nova gerada",
  substituida: "Substituída pela etiqueta nova",
};

/** Consulta com linha do tempo (SQL 30); sem ela, a consulta antiga mantém a página funcionando. */
async function lookupLabel(token: string): Promise<Lookup | null> {
  const current = await rpc("label_lookup", { _token: token });
  if (!current.error) {
    const data = current.data as {
      label: LabelRow;
      events: TimelineEvent[];
      staff: boolean;
      move_options?: MoveOption[];
      source_token?: string | null;
      replaced_by_token?: string | null;
    } | null;
    return data?.label
      ? {
          label: data.label,
          events: data.events ?? [],
          staff: Boolean(data.staff),
          moveOptions: data.move_options,
          sourceToken: data.source_token,
          replacedByToken: data.replaced_by_token,
        }
      : null;
  }
  if (current.error.code !== "PGRST202") return null;
  const { data, error } = await supabase.rpc("get_label_by_token", { _token: token });
  const found = (data as LabelRow[] | null)?.[0] ?? null;
  return error || !found ? null : { label: found, events: null, staff: false };
}

export const Route = createFileRoute("/label/$token")({
  head: () => ({
    meta: [
      { title: "Consulta de etiqueta | TiNutri Smart Label®" },
      {
        name: "description",
        content:
          "Consulte produto, validade, conservação e situação atual da etiqueta de alimento emitida no TiNutri Smart Label®.",
      },
      { property: "og:title", content: "Consulta de etiqueta | TiNutri Smart Label®" },
      {
        property: "og:description",
        content: "Produto, validade, conservação e situação atual da etiqueta.",
      },
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
  allergens: string[] | null;
};

const STATUS_STYLE: Record<LabelStatus, string> = {
  no_prazo: "bg-primary text-primary-foreground",
  proximo: "bg-[var(--warn-bg)] text-[var(--warn-ink)]",
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
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [staff, setStaff] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>(null);
  // Rastreio reverso: outras etiquetas do mesmo lote na empresa (só para a equipe, pelas regras de acesso).
  const [sameLot, setSameLot] = useState<SameLotLabel[] | null>(null);
  const [lineage, setLineage] = useState<
    Pick<Lookup, "moveOptions" | "sourceToken" | "replacedByToken">
  >({});
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  // Só aparece para quem está logado e tem acesso à etiqueta (a política do banco decide).
  const [actor, setActor] = useState<{
    id: string;
    clientId: string;
    userId: string;
    userName: string;
    canSettle: boolean;
  } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = await lookupLabel(token);
      if (!alive) return;
      if (!found) {
        setState("missing");
        return;
      }
      setRow(found.label);
      setEvents(found.events);
      setStaff(found.staff);
      setLineage(found);
      setState("ready");
      // Leitura pela equipe com acesso à empresa conta como conferência, registrada uma vez a cada 10 minutos.
      if (found.staff && found.events !== null && found.label.label_status === "ativa") {
        // Falha no registro não impede a consulta nem a baixa.
        const check = await rpc("register_label_check", { _token: token });
        const result = check.error ? null : (check.data as { state?: string } | null)?.state;
        if (!alive) return;
        if (result === "registered" || result === "recent") setCheckState(result);
        if (result === "registered") {
          const refreshed = await lookupLabel(token);
          if (alive && refreshed) setEvents(refreshed.events);
        }
      }
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user || !alive) return;
      const [{ data: own }, { data: profile }] = await Promise.all([
        supabase
          .from("issued_labels")
          .select("id,client_id,label_status,print_status,lot_number")
          .eq("public_token", token)
          .maybeSingle(),
        supabase.from("profiles").select("name,email").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!alive || !own) return;
      const lot = own.lot_number?.trim();
      if (lot) {
        const { data: siblings } = await supabase
          .from("issued_labels")
          .select(
            "id,public_token,product_name,label_status,print_status,expires_at,expires_on,location,storage_condition",
          )
          .eq("client_id", own.client_id)
          .eq("lot_number", lot)
          .neq("id", own.id)
          .order("issued_at", { ascending: false })
          .limit(50);
        if (alive) setSameLot((siblings ?? []) as SameLotLabel[]);
      }
      setActor({
        id: own.id,
        clientId: own.client_id,
        userId: user.id,
        userName: profile?.name ?? profile?.email ?? "",
        canSettle: own.label_status === "ativa" && own.print_status === "confirmada",
      });
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <p className="font-semibold text-muted-foreground">Consultando etiqueta…</p>
      </main>
    );
  }

  if (state === "missing" || !row) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div>
          <img
            src={tinutriLogo}
            alt="TiNutri"
            width={56}
            height={56}
            className="mx-auto size-14 object-contain"
          />
          <h1 className="mt-4 text-xl font-bold">Etiqueta não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O código lido não corresponde a nenhuma etiqueta emitida.
          </p>
        </div>
      </main>
    );
  }

  const status = resolveStatus(row.label_status, row.expires_at);

  const reload = async () => {
    const refreshed = await lookupLabel(token);
    if (!refreshed) return;
    setRow(refreshed.label);
    setEvents(refreshed.events);
    setLineage(refreshed);
  };

  const settle = async (choice: Settlement) => {
    if (!actor || busy) return;
    const reason = choice === "descartada" ? formatCloseReason(reasonCode, reasonNote) : null;
    if (choice === "descartada" && !reason) {
      setFeedback("Informe o motivo do descarte.");
      return;
    }
    setBusy(true);
    setFeedback("");
    const { result } = await settleLabelRecord({
      id: actor.id,
      clientId: actor.clientId,
      userId: actor.userId,
      userName: actor.userName,
      status: choice,
      reason,
    });
    setBusy(false);
    if (result === "erro") {
      setFeedback("Não foi possível registrar a baixa. Tente novamente.");
      return;
    }
    if (result === "ja-baixada") {
      setFeedback("Esta etiqueta já recebeu baixa.");
      setActor({ ...actor, canSettle: false });
      return;
    }
    setRow({ ...row, label_status: choice });
    setActor({ ...actor, canSettle: false });
    setDiscarding(false);
    setFeedback(`Baixa registrada: ${choice}.`);
    const refreshed = await lookupLabel(token);
    if (refreshed) setEvents(refreshed.events);
  };

  return (
    <main className="label-page min-h-screen bg-background px-4 py-8">
      <article className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3">
          <img
            src={tinutriLogo}
            alt="TiNutri"
            width={44}
            height={44}
            className="size-11 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <strong className="block font-display text-base leading-tight">
              TiNutri Smart Label®
            </strong>
            <span className="text-xs text-muted-foreground">Consulta de rastreabilidade</span>
          </div>
        </header>

        <section className="mt-5 rounded-3xl border bg-card p-5 shadow-sm">
          <h1 className="text-2xl font-bold uppercase leading-tight">{row.product_name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p
              className={`inline-flex rounded-full px-3 py-1.5 text-sm font-extrabold uppercase tracking-wide ${STATUS_STYLE[status]}`}
            >
              {STATUS_TEXT[status]}
            </p>
            <p className="text-sm font-semibold text-muted-foreground">
              {kindLabel(row.label_kind)}
            </p>
          </div>
          {/* A validade é a informação principal da etiqueta: vem antes de todo o resto, em destaque. */}
          <div
            className={`mt-5 rounded-2xl px-4 py-3 ${
              status === "vencido"
                ? "bg-[var(--bad-bg)]"
                : status === "proximo"
                  ? "bg-[var(--warn-bg)]"
                  : "bg-muted"
            }`}
          >
            <p className="text-xs font-semibold text-muted-foreground">Validade</p>
            <p
              className={`mt-0.5 text-[clamp(22px,7.2vw,30px)] font-bold tracking-tight tabular-nums ${
                status === "vencido"
                  ? "text-destructive"
                  : status === "proximo"
                    ? "text-[var(--warn-ink)]"
                    : ""
              }`}
            >
              {fmt(row.expires_at)}
            </p>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <Row term="Estabelecimento" value={row.client_name} />
            <Row term="Setor" value={row.sector ?? "—"} />
            <Row term="Manipulação / abertura" value={fmt(row.opened_at)} />
            <Row term="Conservação" value={row.storage_condition ?? "—"} />
            <Row term="Lote" value={row.lot_number ?? "—"} />
            {row.inspection_label && <Row term="Inspeção" value={row.inspection_label} />}
            {allergenText(row.allergens) && (
              <Row term="Alérgenos" value={allergenText(row.allergens)!} strong />
            )}
            <Row term="Responsável" value={row.responsible_name} />
            <Row term="Localização atual" value={row.location ?? "Não informada"} />
            <Row term="Emitida em" value={fmt(row.issued_at)} />
          </dl>
        </section>

        {actor?.canSettle && (
          <section className="mt-4 rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold">Dar baixa nesta etiqueta</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                className="min-h-12 rounded-xl border text-sm font-semibold"
                onClick={() => void settle("utilizada")}
              >
                Utilizada
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-12 rounded-xl border text-sm font-semibold"
                onClick={() => void settle("consumida")}
              >
                Consumida
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-12 rounded-xl border text-sm font-semibold"
                onClick={() => setDiscarding(true)}
              >
                Descartada
              </button>
            </div>
            {discarding && (
              <div>
                <DiscardReasonField
                  code={reasonCode}
                  note={reasonNote}
                  onCode={setReasonCode}
                  onNote={setReasonNote}
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy || !formatCloseReason(reasonCode, reasonNote)}
                  className="mt-3 min-h-12 w-full rounded-xl bg-destructive text-sm font-bold text-destructive-foreground disabled:opacity-50"
                  onClick={() => void settle("descartada")}
                >
                  Confirmar descarte
                </button>
              </div>
            )}
          </section>
        )}
        {feedback && (
          <p role="status" className="mt-3 text-center text-sm font-semibold">
            {feedback}
          </p>
        )}

        {sameLot && row.lot_number && (
          <section
            className="mt-4 rounded-3xl border bg-card p-5 shadow-sm"
            aria-labelledby="same-lot-title"
          >
            <h2 id="same-lot-title" className="text-sm font-bold">
              Mesmo lote ({row.lot_number}): {sameLot.length}{" "}
              {sameLot.length === 1 ? "outra etiqueta" : "outras etiquetas"}
            </h2>
            {sameLot.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma outra etiqueta da empresa usa este lote.
              </p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {sameLot.map((item) => {
                  const itemStatus = resolveStatus(
                    item.label_status,
                    item.expires_at ?? `${item.expires_on}T23:59:59`,
                  );
                  return (
                    <li key={item.id}>
                      <a
                        href={`/label/${item.public_token}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{item.product_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Validade {fmt(item.expires_at ?? `${item.expires_on}T23:59:59`)}
                            {item.location ? ` · ${item.location}` : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${STATUS_STYLE[itemStatus]}`}
                        >
                          {STATUS_TEXT[itemStatus]}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {lineage.replacedByToken && (
          <p className="mt-4 rounded-2xl border bg-card p-4 text-sm">
            Esta etiqueta foi substituída após mudança de conservação.{" "}
            <a
              className="font-bold text-primary underline underline-offset-4"
              href={`/label/${lineage.replacedByToken}`}
            >
              Ver a etiqueta nova
            </a>
          </p>
        )}
        {lineage.sourceToken && (
          <p className="mt-4 rounded-2xl border bg-card p-4 text-sm">
            Gerada a partir de outra etiqueta, após mudança de conservação.{" "}
            <a
              className="font-bold text-primary underline underline-offset-4"
              href={`/label/${lineage.sourceToken}`}
            >
              Ver a etiqueta de origem
            </a>
          </p>
        )}

        {staff && lineage.moveOptions && row.label_status === "ativa" && (
          <LabelMovePanel
            token={token}
            location={row.location}
            options={lineage.moveOptions}
            expired={status === "vencido"}
            onChanged={async () => {
              await reload();
            }}
          />
        )}

        {events && (
          <section
            className="mt-4 rounded-3xl border bg-card p-5 shadow-sm"
            aria-labelledby="timeline-title"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="timeline-title" className="text-sm font-bold">
                Histórico desta etiqueta
              </h2>
              {checkState && (
                <span role="status" className="text-xs font-semibold text-primary">
                  {checkState === "registered"
                    ? "Sua conferência foi registrada"
                    : "Você conferiu há poucos minutos"}
                </span>
              )}
            </div>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum registro além da emissão.</p>
            ) : (
              <ol className="mt-4 space-y-0">
                {events.map((event, index) => (
                  <li
                    key={`${event.type}-${event.at}-${index}`}
                    className="relative flex gap-3 pb-4 last:pb-0"
                  >
                    {index < events.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[5px] top-4 h-full w-px bg-border"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${event.type.startsWith("baixa_") ? "border-muted-foreground bg-muted" : event.type === "falha_impressao" ? "border-destructive bg-card" : "border-primary bg-card"}`}
                    />
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">
                        {TIMELINE_NAMES[event.type] ?? "Registro da etiqueta"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(event.at)}
                        {staff && event.by ? ` · ${event.by}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {!staff && (
              <p className="mt-4 text-xs text-muted-foreground">
                A equipe do estabelecimento vê também quem realizou cada registro.
              </p>
            )}
          </section>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Situação calculada com base na validade registrada. Código {row.public_token.slice(0, 8)}…
        </p>
      </article>
    </main>
  );
}

function Row({
  term,
  value,
  strong = false,
  tone,
}: {
  term: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="min-w-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd
        className={`shrink-0 text-right whitespace-nowrap ${strong ? `text-lg font-extrabold ${tone ?? "text-primary"}` : "font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  );
}
