import { OwnSignatureForm } from "./OwnSignatureForm";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Download, FileText, LockKeyhole, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/billing";
import { SIGNATURE_ISSUE_NAMES, type PublicOffer } from "@/lib/contracting/domain";
import {
  beginSignature,
  confirmOwnSignature,
  downloadOffer,
  payOffer,
  readPublicOffer,
} from "@/lib/contracting/functions";
import logo from "@/assets/tinutri-logo-ui.webp";

const contractJourneyApi = {
  read: (token: string) => readPublicOffer({ data: { token } }),
  confirmOwn: (token: string, challengeId: string, code: string) =>
    confirmOwnSignature({
      data: { token, challengeId, code, accepted: true, consentVersion: "tinutri-email-v1" },
    }),
  sign: (token: string) => beginSignature({ data: { token, reviewed: true } }),
  download: (token: string, signed: boolean) => downloadOffer({ data: { token, signed } }),
  pay: (token: string) => payOffer({ data: { token } }),
};
export function ContractJourney({
  token,
  api = contractJourneyApi,
}: {
  token: string;
  api?: typeof contractJourneyApi;
}) {
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const next = await api.read(token);
    setOffer(next);
  }, [api, token]);
  useEffect(() => {
    let alive = true;
    setOffer(null);
    setLoading(true);
    setError("");
    setReviewed(false);
    setCheckoutUrl(null);
    if (!token) {
      setError("Abra o link completo que você recebeu da TiNutri.");
      setLoading(false);
      return;
    }
    void api
      .read(token)
      .then((next) => {
        if (alive) setOffer(next);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Não foi possível abrir a contratação.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, api]);
  useEffect(() => {
    if (
      offer?.signature_status !== "awaiting" &&
      offer?.signature_status !== "preparing" &&
      offer?.payment_status !== "pending"
    )
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {
          /* Manual refresh reports transient failures without disrupting reading. */
        });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [offer?.signature_status, offer?.payment_status, refresh]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const download = (signed: boolean) =>
    void run(async () => {
      const result = await api.download(token, signed);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      if (!result.base64) throw new Error("Documento indisponível.");
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "contrato-tinutri.pdf";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const step =
    offer?.stage === "active" || offer?.stage === "activation"
      ? 2
      : offer?.signature_status === "signed"
        ? 1
        : 0;
  return (
    <main className="min-h-screen bg-background px-4 py-7 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center gap-3">
          <img src={logo} alt="TiNutri" className="h-10 w-9 object-contain" />
          <div>
            <strong className="block text-base">TiNutri Smart Label®</strong>
            <span className="text-xs text-muted-foreground">Sua contratação, passo a passo</span>
          </div>
        </header>
        <nav aria-label="Etapas da contratação">
          <ol className="mb-8 grid grid-cols-3 gap-2 sm:gap-4">
            {["Contrato", "Pagamento", "Acesso"].map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs sm:flex-row sm:justify-start sm:gap-2 sm:px-4 sm:text-left sm:text-sm ${index === step ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground"}`}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
                  {index < step ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </nav>
        {loading && (
          <p role="status" className="rounded-2xl border bg-card p-8">
            Carregando seu contrato…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <p>{error}</p>
            {!offer && token && (
              <Button
                className="mt-3"
                variant="outline"
                disabled={busy}
                onClick={() => void run(refresh)}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="mb-5 rounded-xl border bg-primary/5 p-4 text-sm">
            {notice}
          </p>
        )}
        {offer && (
          <>
            {offer.signature_environment === "sandbox" && (
              <p className="mb-5 rounded-lg border bg-secondary p-3 text-sm">
                Ambiente de teste. Esta contratação não gera cobrança nem libera acesso ao sistema.
              </p>
            )}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-w-0 rounded-2xl border bg-card p-5 sm:p-7">
                <div className="mb-5 flex items-start gap-3">
                  <FileText className="mt-1 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h1 className="break-words text-xl font-semibold">
                      {offer.signature_status === "signed"
                        ? "Contrato assinado"
                        : "Confira sua contratação"}
                    </h1>
                    <p className="mt-2 break-words text-sm text-muted-foreground">
                      {offer.company_name}
                    </p>
                  </div>
                </div>
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-primary/5 p-3 text-sm lg:hidden">
                  <span className="capitalize">Plano {offer.commercial.plan.cycle}</span>
                  <strong className="tabular-nums">
                    {money(offer.commercial.plan.total_cents)} por ciclo
                  </strong>
                </div>
                <details open={step === 0} className="rounded-xl border">
                  <summary className="cursor-pointer px-4 py-4 text-sm font-semibold">
                    Ler contrato completo
                  </summary>
                  <article
                    aria-label="Documento contratado"
                    className="max-h-[60vh] overflow-y-auto overscroll-contain border-t px-4 py-5 text-sm leading-relaxed sm:px-6"
                  >
                    {offer.body.split(/\n\n+/).map((part, index) => (
                      <p key={index} className="mb-5 whitespace-pre-wrap break-words last:mb-0">
                        {part}
                      </p>
                    ))}
                  </article>
                </details>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => download(false)}>
                    <Download />
                    Baixar contrato
                  </Button>
                  {offer.signedDocumentAvailable && (
                    <Button variant="outline" disabled={busy} onClick={() => download(true)}>
                      <Download />
                      Baixar PDF assinado
                    </Button>
                  )}
                </div>
                {step === 0 && (
                  <div className="mt-6 border-t pt-6">
                    <h2 className="text-base font-semibold">Assinatura do representante</h2>
                    <p className="mt-2 break-words text-sm">
                      {offer.signerName} ·{" "}
                      <span className="text-muted-foreground">{offer.signerEmailHint}</span>
                    </p>
                    {offer.signatureIssue && offer.signatureIssue !== "delivery_failed" ? (
                      <p role="status" className="mt-4 rounded-lg border p-4 text-sm">
                        {SIGNATURE_ISSUE_NAMES[offer.signatureIssue]}. Fale com a TiNutri para
                        revisar a contratação antes de continuar.
                      </p>
                    ) : !offer.signatureAvailable ? (
                      <p className="mt-4 rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
                        A assinatura eletrônica ainda não está disponível. Você já pode conferir o
                        documento; a TiNutri avisará quando for possível continuar.
                      </p>
                    ) : offer.signatureMethod === "tinutri" && offer.ownSignature ? (
                      <OwnSignatureForm
                        key={token}
                        summary={offer.ownSignature}
                        party="client"
                        onRequest={() => api.sign(token) as Promise<{ state: string }>}
                        onConfirm={(id, code) => api.confirmOwn(token, id, code)}
                        onRefresh={refresh}
                      />
                    ) : offer.signature_status === "pending" ? (
                      <>
                        <label className="mt-5 flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0"
                            checked={reviewed}
                            disabled={busy}
                            onChange={(e) => setReviewed(e.target.checked)}
                          />
                          <span>
                            Li o contrato e conferi os dados e o plano. Quero continuar para a
                            assinatura eletrônica.
                          </span>
                        </label>
                        <Button
                          className="mt-5 min-h-11 w-full sm:w-auto"
                          disabled={!reviewed || busy}
                          onClick={() =>
                            void run(async () => {
                              await api.sign(token);
                              await refresh();
                              setNotice(
                                "Solicitação enviada aos representantes. Confira seu e-mail para assinar e depois retorne a esta página.",
                              );
                            })
                          }
                        >
                          {busy ? "Preparando assinatura…" : "Continuar para assinatura"}
                          <ArrowRight />
                        </Button>
                        <p className="mt-3 text-xs text-muted-foreground">
                          A assinatura será concluída na Clicksign, com verificação por e-mail. Esta
                          confirmação de leitura ainda não é uma assinatura.
                        </p>
                      </>
                    ) : (
                      <div className="mt-4 flex items-start gap-3 rounded-xl bg-secondary/50 p-4">
                        <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
                        <p className="text-sm">
                          {offer.signature_status === "awaiting"
                            ? "Confira seu e-mail para abrir o link de assinatura. Após a assinatura dos dois representantes, esta página avançará para o pagamento."
                            : offer.signature_status === "preparing"
                              ? "Estamos preparando os documentos. Aguarde e atualize a situação em instantes."
                              : "A solicitação precisa de verificação pela TiNutri. Entre em contato para continuar com segurança."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {step === 1 && (
                  <div className="mt-6 rounded-xl border bg-primary/5 p-5">
                    <h2 className="font-semibold">Assinaturas concluídas</h2>
                    <p className="mt-2 text-sm">
                      {offer.payment_status === "refunded"
                        ? "O pagamento foi invalidado ou estornado. Fale com a TiNutri para revisar a contratação."
                        : offer.paymentAvailable
                          ? offer.signature_environment === "sandbox"
                            ? "Ambiente de teste: a fatura será aberta no sandbox do Asaas. Este pagamento não libera acesso real ao sistema."
                            : "Seu contrato foi formalizado. Pague a fatura no Asaas; após a confirmação, o acesso é preparado para o e-mail informado na contratação."
                          : "Seu contrato foi formalizado. O pagamento online ainda não está disponível. A TiNutri informará quando você puder continuar por este mesmo link."}
                    </p>
                    {offer.paymentAvailable && offer.payment_status !== "refunded" ? (
                      checkoutUrl ? (
                        <Button asChild className="mt-4">
                          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                            {offer.signature_environment === "sandbox"
                              ? "Abrir fatura de teste"
                              : "Abrir fatura"}{" "}
                            <ArrowRight />
                          </a>
                        </Button>
                      ) : (
                        <Button
                          className="mt-4"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const result = await api.pay(token);
                              setCheckoutUrl(result.checkoutUrl);
                              await refresh();
                            })
                          }
                        >
                          {busy
                            ? "Preparando fatura…"
                            : offer.signature_environment === "sandbox"
                              ? "Preparar pagamento de teste"
                              : "Preparar pagamento"}
                          <ArrowRight />
                        </Button>
                      )
                    ) : (
                      <Button className="mt-4" disabled>
                        <LockKeyhole />
                        Pagamento indisponível
                      </Button>
                    )}
                  </div>
                )}
                {step === 2 && (
                  <div className="mt-6 rounded-xl border bg-primary/5 p-5">
                    <h2 className="font-semibold">
                      {offer.signature_environment === "sandbox"
                        ? "Pagamento de teste confirmado"
                        : offer.stage === "active"
                          ? "Acesso liberado"
                          : "Preparando seu acesso"}
                    </h2>
                    <p className="mt-2 text-sm">
                      {offer.signature_environment === "sandbox"
                        ? "Teste concluído no sandbox. Nenhum usuário real será convidado e nenhum acesso será liberado."
                        : offer.stage === "active"
                          ? "Novos responsáveis recebem um convite no e-mail informado na contratação. Se você já possui conta, use seu acesso habitual."
                          : "O pagamento foi confirmado. Aguarde a conclusão da ativação."}
                    </p>
                    {offer.stage === "active" && (
                      <Button asChild className="mt-4">
                        <a href="/">
                          Acessar o sistema
                          <ArrowRight />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </section>
              <aside
                aria-label="Resumo do plano"
                className="min-w-0 space-y-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-6"
              >
                <h2 className="text-sm font-semibold">Seu plano</h2>
                <div>
                  <p className="text-base capitalize">{offer.commercial.plan.cycle}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">
                    {money(offer.commercial.plan.total_cents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Total por ciclo de {offer.commercial.plan.months}{" "}
                    {offer.commercial.plan.months === 1 ? "mês" : "meses"}
                  </p>
                </div>
                <dl className="space-y-4 border-t pt-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Pagamento</dt>
                    <dd className="mt-1">
                      {
                        { pix: "Pix", boleto: "Boleto", cartao: "Cartão de crédito" }[
                          offer.commercial.payment
                        ]
                      }
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Renovação</dt>
                    <dd className="mt-1">
                      {offer.commercial.renewal === "manual"
                        ? "Mediante nova confirmação"
                        : "Automática, conforme o contrato"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Início do período</dt>
                    <dd className="mt-1">Após assinatura e pagamento</dd>
                  </div>
                </dl>
                <p className="border-t pt-4 text-xs text-muted-foreground">
                  Link disponível até{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(offer.expires_at))}{" "}
                  (horário de Brasília).
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh();
                      setNotice("Situação atualizada.");
                    })
                  }
                >
                  <RefreshCw />
                  Atualizar situação
                </Button>
              </aside>
            </div>
          </>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Dúvidas ou dados incorretos? Fale com a TiNutri antes de assinar.
        </p>
      </div>
    </main>
  );
}
