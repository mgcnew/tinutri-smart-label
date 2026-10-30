import { OwnSignatureForm } from "@/components/contracting/OwnSignatureForm";
import { useEffect, useState, type FormEvent } from "react";
import { Copy, ExternalLink, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import {
  commercialSchema,
  offerStage,
  STAGE_NAMES,
  SIGNATURE_ISSUE_NAMES,
  OFFER_EVENT_NAMES,
  ACTIVATION_ERROR_NAMES,
  type Person,
} from "@/lib/contracting/domain";
import {
  listOffers,
  manageOffer,
  publishOffer,
  retryOfferActivation,
  checkPayment,
  masterOwnSignature,
  downloadOwnContract,
} from "@/lib/contracting/functions";
import { money } from "@/lib/billing";
import type { ServiceContract } from "@/lib/contracts";
import { contractPending } from "@/lib/contract-template";
import { loadTinutriProfile } from "@/lib/tinutri-profile";
import { MasterModal, Field, Feedback } from "./Shared";

const when = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));

type Listing = Awaited<ReturnType<typeof listOffers>>;
export function ContractOfferModal({
  contract,
  onClose,
}: {
  contract: ServiceContract;
  onClose: () => void;
}) {
  const company =
    typeof contract.company_snapshot === "object" && !Array.isArray(contract.company_snapshot)
      ? contract.company_snapshot
      : null;
  const [signer, setSigner] = useState<Person>({
    name: String(company?.responsible_name ?? ""),
    email: String(company?.email ?? ""),
  });
  const [providerSigner, setProviderSigner] = useState<Person>({ name: "", email: "" });
  const [accessContact, setAccessContact] = useState<Person>({ name: "", email: "" });
  const [sameContact, setSameContact] = useState(true);
  const [expiresDays, setExpiresDays] = useState(7);
  const [reviewed, setReviewed] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const commercial = commercialSchema.safeParse(contract.commercial_snapshot);
  const pending = contractPending(contract.body);
  const openOffer = listing?.offers.find((offer) => !offer.revoked_at);
  const refresh = async () => {
    setListing(await listOffers({ data: { contractId: contract.id } }));
  };
  // Representante da TiNutri vem de Configurações → Empresa; continua editável.
  useEffect(() => {
    const controller = new AbortController();
    loadTinutriProfile(controller.signal)
      .then((saved) => {
        if (controller.signal.aborted || !saved) return;
        setProviderSigner((current) =>
          current.name || current.email
            ? current
            : { name: saved.representative, email: saved.representative_email },
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let alive = true;
    void listOffers({ data: { contractId: contract.id } })
      .then((data) => {
        if (alive) setListing(data);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Não foi possível carregar as contratações.");
      });
    return () => {
      alive = false;
    };
  }, [contract.id]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  };
  const publish = (e: FormEvent) => {
    e.preventDefault();
    if (!reviewed) return;
    void run(async () => {
      const result = await publishOffer({
        data: {
          contractId: contract.id,
          updatedAt: contract.updated_at,
          signer,
          providerSigner,
          accessContact: sameContact ? signer : accessContact,
          expiresDays,
          reviewed: true,
        },
      });
      setLink(result.link);
      setNotice("Link preparado. Copie e envie ao cliente pelo canal combinado.");
      await refresh();
    });
  };
  return (
    <MasterModal
      open
      wide
      busy={busy}
      onClose={onClose}
      title="Contratação por link"
      description={contract.title}
      footer={
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-5">
        {listing && (
          <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" />{" "}
              {listing.environment === "sandbox" ? "Ambiente de teste" : "Ambiente de produção"}
            </p>
            <p className="mt-2 text-muted-foreground">
              {listing.signatureAvailable
                ? "Assinatura configurada. O cliente poderá continuar pela página do contrato."
                : "A assinatura ainda precisa ser configurada. O link permite revisar o contrato, mas não assinar."}{" "}
              {!listing.paymentAvailable
                ? "Pagamento online ainda indisponível."
                : listing.environment === "sandbox"
                  ? "Pagamento de teste configurado para contratos com renovação manual. Nenhum acesso real será liberado pelo sandbox."
                  : listing.activationAvailable
                    ? "Pagamento de produção configurado para contratos com renovação manual. O pagamento confirmado libera o acesso automaticamente."
                    : "Pagamento de produção configurado para contratos com renovação manual. A liberação automática está desligada: após o pagamento, use Retomar ativação quando ela for habilitada."}
            </p>
          </div>
        )}
        {commercial.success && (
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted-foreground">Plano</span>
              <strong className="block capitalize">{commercial.data.plan.cycle}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Total por ciclo</span>
              <strong className="block">{money(commercial.data.plan.total_cents)}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Início do período</span>
              <strong className="block text-sm">Após assinatura e pagamento</strong>
            </div>
          </div>
        )}
        <Feedback error={error} notice={notice} />
        {link && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <label className="block text-sm font-semibold" htmlFor="contract-share-link">
              Link para o cliente
            </label>
            <input
              id="contract-share-link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(link);
                    setNotice("Link copiado.");
                  })
                }
              >
                <Copy />
                Copiar link
              </Button>
              <Button asChild variant="outline">
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Abrir página
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Guarde este link. Ao gerar outro, o anterior deixa de funcionar.
            </p>
          </div>
        )}
        {listing &&
          !openOffer &&
          (!commercial.success || pending.length > 0 || contract.status === "arquivada") && (
            <div role="status" className="space-y-3 rounded-xl border p-4 text-sm">
              <p className="font-medium">Esta minuta ainda não pode virar link. Falta:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {contract.status === "arquivada" && <li>Usar uma minuta não arquivada.</li>}
                {!commercial.success && (
                  <li>
                    Gerar o documento de novo com início na ativação e forma de pagamento definida
                    (Pix, boleto ou cartão).
                  </li>
                )}
                {pending.map((item) => (
                  <li key={item}>
                    <span className="first-letter:uppercase">{item}</span>
                    <span className="text-muted-foreground"> · {pendingHint(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        {listing &&
          !openOffer &&
          commercial.success &&
          !pending.length &&
          contract.status !== "arquivada" && (
            <form className="space-y-5" onSubmit={publish}>
              <fieldset disabled={busy} className="space-y-5">
                <PersonFields
                  title="Representante do cliente"
                  value={signer}
                  onChange={setSigner}
                />
                <PersonFields
                  title="Representante da TiNutri"
                  value={providerSigner}
                  onChange={setProviderSigner}
                />
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={sameContact}
                    onChange={(e) => setSameContact(e.target.checked)}
                  />
                  <span>O representante do cliente também será o responsável pelo acesso.</span>
                </label>
                {!sameContact && (
                  <PersonFields
                    title="Responsável pelo acesso ao sistema"
                    value={accessContact}
                    onChange={setAccessContact}
                  />
                )}
                <Field label="Prazo do link">
                  <SystemSelect
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(Number(e.target.value))}
                  >
                    {[3, 7, 15, 30].map((days) => (
                      <option key={days} value={days}>
                        {days} dias
                      </option>
                    ))}
                  </SystemSelect>
                </Field>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    className="mt-1 size-4 shrink-0"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  <span>
                    Revisei o texto, os valores e os representantes. As condições acima correspondem
                    ao contrato e podem ser compartilhadas com o cliente.
                  </span>
                </label>
                <Button type="submit" disabled={!reviewed || busy}>
                  <Link2 />
                  {busy ? "Preparando…" : "Preparar link"}
                </Button>
              </fieldset>
            </form>
          )}
        {listing?.offers.map((offer) => (
          <article key={offer.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">
                {!offer.revoked_at && offer.signature_issue
                  ? SIGNATURE_ISSUE_NAMES[offer.signature_issue]
                  : STAGE_NAMES[offerStage(offer)]}
              </strong>
              <span className="text-xs text-muted-foreground">Até {when(offer.expires_at)}</span>
            </div>
            <p className="break-words text-sm">
              {offer.signer.name} · {offer.signer.email}
            </p>
            {(offer.signature_status === "failed" || offer.signature_status === "preparing") && (
              <p className="text-xs text-muted-foreground">
                {offer.signature_status === "preparing"
                  ? "Preparando envio para assinatura. Atualize em instantes."
                  : offer.signature_issue && offer.signature_issue !== "delivery_failed"
                    ? "Esta solicitação não pode continuar. Confira o motivo e prepare uma nova contratação se necessário."
                    : "O envio precisa de verificação no provedor. Consulte o guia de recuperação antes de preparar outra contratação."}
              </p>
            )}
            {offer.activation && (
              <div className="rounded-lg border p-3 text-sm">
                <strong>
                  {offer.activation.status === "completed"
                    ? "Acesso liberado"
                    : offer.activation.status === "processing"
                      ? "Preparando acesso"
                      : offer.activation.status === "blocked"
                        ? "Ativação precisa de revisão"
                        : "Ativação aguardando processamento"}
                </strong>
                {offer.activation.error_code && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ACTIVATION_ERROR_NAMES[offer.activation.error_code]}
                  </p>
                )}
                {(offer.activation.status === "blocked" || offer.activation.status === "pending") &&
                  listing.activationAvailable && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await retryOfferActivation({ data: { id: offer.id } });
                          if (result.state === "blocked")
                            throw new Error(ACTIVATION_ERROR_NAMES[result.code]);
                          await refresh();
                          setNotice(
                            result.state === "completed"
                              ? "Acesso liberado."
                              : "A ativação já está sendo processada.",
                          );
                        })
                      }
                    >
                      Retomar ativação
                    </Button>
                  )}
              </div>
            )}
            {offer.signature_method === "tinutri" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await downloadOwnContract({
                        data: { id: offer.id, signed: false },
                      });
                      window.location.assign(result.url);
                    })
                  }
                >
                  Conferir PDF original
                </Button>
                {offer.signature_status === "signed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await downloadOwnContract({
                          data: { id: offer.id, signed: true },
                        });
                        window.location.assign(result.url);
                      })
                    }
                  >
                    Baixar contrato com comprovante
                  </Button>
                )}
              </div>
            )}
            {offer.signature_method === "tinutri" &&
              offer.ownSignature &&
              !offer.revoked_at &&
              offer.signature_status !== "signed" && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold">Assinatura do representante TiNutri</h3>
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    {offer.provider_signer.name} · {offer.provider_signer.email}
                  </p>
                  {listing.signatureAvailable && listing.signatureMethod === "tinutri" ? (
                    <OwnSignatureForm
                      key={offer.id}
                      party="tinutri"
                      summary={offer.ownSignature}
                      onRequest={() =>
                        masterOwnSignature({ data: { id: offer.id, action: "request" } })
                      }
                      onConfirm={(challengeId, code) =>
                        masterOwnSignature({
                          data: {
                            id: offer.id,
                            action: "confirm",
                            confirmation: {
                              challengeId,
                              code,
                              accepted: true,
                              consentVersion: "tinutri-email-v1",
                            },
                          },
                        })
                      }
                      onRefresh={refresh}
                    />
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Configure o envio de códigos para continuar.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.signatureAvailable && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await masterOwnSignature({
                              data: { id: offer.id, action: "retry_mail" },
                            });
                            await refresh();
                            setNotice(
                              "Pedidos de envio conferidos. Consulte a situação do código.",
                            );
                          })
                        }
                      >
                        Retomar envio pendente
                      </Button>
                    )}
                    {offer.ownSignature.clientAccepted && offer.ownSignature.tinutriAccepted && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result = await masterOwnSignature({
                              data: { id: offer.id, action: "finalize" },
                            });
                            await refresh();
                            setNotice(
                              result.state === "signed"
                                ? "Documento finalizado com os dois aceites preservados."
                                : "Aguardando os dois aceites.",
                            );
                          })
                        }
                      >
                        Finalizar documento
                      </Button>
                    )}
                  </div>
                </section>
              )}
            {offer.checkout && (
              <div className="rounded-lg border p-3 text-sm">
                <strong>
                  {
                    {
                      preparing: "Preparando fatura",
                      ready: "Fatura preparada",
                      blocked: "Preparação da fatura precisa de revisão",
                    }[offer.checkout.status]
                  }
                </strong>
                {offer.checkout.status !== "ready" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confira a cobrança no Asaas antes de tentar novamente ou revogar a contratação.
                  </p>
                )}
                {offer.checkout.status === "ready" &&
                  !offer.revoked_at &&
                  (listing.paymentCheckEnvironments ?? []).some(
                    (environment) => environment === offer.signature_environment,
                  ) && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await checkPayment({ data: { id: offer.id } });
                          await refresh();
                          setNotice(
                            result.state === "confirmed_sandbox"
                              ? "Pagamento de teste confirmado no Asaas. Nenhum acesso real foi liberado."
                              : result.state === "confirmed"
                                ? "Pagamento confirmado no Asaas. A ativação do acesso foi colocada na fila."
                                : result.state === "invalidated"
                                  ? "Pagamento invalidado conforme a situação consultada no Asaas."
                                  : result.state === "waiting"
                                    ? "O Asaas ainda não confirmou o pagamento."
                                    : "Conferência concluída. A contratação precisa de revisão antes de continuar.",
                          );
                        })
                      }
                    >
                      <RefreshCw />
                      Conferir pagamento no Asaas
                    </Button>
                  )}
              </div>
            )}
            {!!offer.events?.length && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Atividades recentes
                </summary>
                <ol className="mt-3 max-h-56 space-y-3 overflow-y-auto text-xs">
                  {offer.events.map((item, index) => (
                    <li key={`${item.kind}-${item.created_at}-${index}`}>
                      <span className="block">
                        {OFFER_EVENT_NAMES[item.kind] ?? "Contratação atualizada"}
                      </span>
                      <time dateTime={item.created_at} className="mt-1 block text-muted-foreground">
                        {when(item.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {!offer.revoked_at && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || offerStage(offer) === "expired"}
                  onClick={() =>
                    void run(async () => {
                      const result = await manageOffer({
                        data: { id: offer.id, action: "rotate" },
                      });
                      setLink(result.link ?? "");
                      setNotice("Novo link gerado. O anterior foi invalidado.");
                      await refresh();
                    })
                  }
                >
                  <RefreshCw />
                  Gerar novo link
                </Button>
                <Button
                  variant="ghost"
                  disabled={
                    busy ||
                    !!offer.activated_at ||
                    offer.payment_status === "confirmed" ||
                    !!offer.checkout
                  }
                  onClick={() => setConfirmRevoke(offer.id)}
                >
                  Revogar contratação
                </Button>
              </div>
            )}
            {confirmRevoke === offer.id && (
              <div className="rounded-lg border border-destructive/30 p-3 text-sm">
                <p>
                  Revogar impede novas ações por este link e cancela a solicitação de assinatura
                  ainda pendente no provedor. Os registros já concluídos serão preservados.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await manageOffer({ data: { id: offer.id, action: "revoke" } });
                        setLink("");
                        setConfirmRevoke(null);
                        await refresh();
                        setNotice("Contratação revogada.");
                      })
                    }
                  >
                    Confirmar revogação
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmRevoke(null)}>
                    Voltar
                  </Button>
                </div>
              </div>
            )}
          </article>
        ))}
        {listing && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(refresh)}>
            <RefreshCw />
            Atualizar situação
          </Button>
        )}
        {!listing && !error && <p role="status">Carregando contratação…</p>}
        {!listing && error && (
          <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>
            Tentar novamente
          </Button>
        )}
      </div>
    </MasterModal>
  );
}
function PersonFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Person;
  onChange: (value: Person) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo">
          <input
            required
            minLength={2}
            maxLength={120}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="E-mail">
          <input
            required
            type="email"
            maxLength={160}
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        </Field>
      </div>
    </section>
  );
}
/** Onde corrigir cada pendência marcada como [PENDENTE: ...] na minuta. */
function pendingHint(item: string) {
  if (item.includes("contratante")) return "preencha no cadastro da empresa e gere de novo";
  if (/TiNutri|suporte|exportação/.test(item))
    return "preencha em Configurações → Empresa e gere de novo";
  return "defina no gerador de contrato e gere de novo";
}
