import { useEffect, useState, type FormEvent } from "react";
import { FileText, Printer, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import { careUnavailable, errorMessage, type Company } from "@/lib/management";
import { billingPlan, money } from "@/lib/billing";
import { contracts, printContract, CONTRACT_STATUS, type ServiceContract } from "@/lib/contracts";
import {
  contractDraft,
  contractPending,
  EMPTY_PROVIDER,
  EMPTY_TERMS,
  CONTRACT_TEMPLATE_VERSION,
  type ContractTerms,
  type ContractProvider,
} from "@/lib/contract-template";
import type { CommercialSnapshot } from "@/lib/contracting/domain";
import { MasterModal, Field, Feedback, SaveButton } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";

export function ContractEditor({
  record,
  initialClient,
  onClose,
  onSaved,
}: {
  record: ServiceContract | null;
  initialClient: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [client, setClient] = useState(record?.client_id ?? initialClient);
  const [company, setCompany] = useState<Company | null>(null);
  const [title, setTitle] = useState(record?.title ?? "");
  const [body, setBody] = useState(record?.body ?? "");
  const [status, setStatus] = useState<ServiceContract["status"]>(record?.status ?? "rascunho");
  const [commercial, setCommercial] = useState<CommercialSnapshot | null>(
    (record?.commercial_snapshot as CommercialSnapshot | null) ?? null,
  );
  const [terms, setTerms] = useState<ContractTerms>({ ...EMPTY_TERMS, startOnActivation: true });
  const [provider, setProvider] = useState<ContractProvider>({ ...EMPTY_PROVIDER });
  const [step, setStep] = useState<"condicoes" | "previa" | "texto">(
    record ? "previa" : "condicoes",
  );
  const [loading, setLoading] = useState(!record && Boolean(initialClient));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = company ? billingPlan(company.plan) : undefined;
  const pending = contractPending(body);
  useEffect(() => {
    if (record) return;
    setCompany(null);
    setBody("");
    setCommercial(null);
    setTitle("");
    setError("");
    if (!client) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .eq("id", client)
          .abortSignal(controller.signal)
          .single();
        if (controller.signal.aborted) return;
        if (error || !data)
          throw new Error(
            "Não foi possível carregar os dados da empresa. Tente selecioná-la novamente.",
          );
        if (!billingPlan(data.plan))
          throw new Error(
            "Atualize o plano da empresa para mensal, trimestral ou anual antes de gerar o contrato.",
          );
        setCompany(data);
        setTitle(`Licença e serviços · ${data.name}`.slice(0, 160));
        setTerms((previous) => ({ ...previous, startsOn: data.subscription_started_on ?? "" }));
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Falha ao carregar a empresa.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [client, record]);
  const generate = () => {
    if (!company || busy || loading) return;
    try {
      setBody(contractDraft(company, terms, provider));
      const selected = billingPlan(company.plan)!;
      setCommercial(
        terms.startOnActivation && terms.payment !== "a_definir"
          ? {
              start: "activation",
              payment: terms.payment,
              renewal: terms.renewal,
              plan: {
                cycle: company.plan as CommercialSnapshot["plan"]["cycle"],
                months: selected.months,
                monthly_cents: selected.monthlyCents,
                total_cents: selected.monthlyCents * selected.months,
              },
            }
          : null,
      );
      setStep("previa");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o documento.");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step === "condicoes") {
      generate();
      return;
    }
    if (busy || loading || !client || body.trim().length < 20 || title.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        status,
        commercial_snapshot: commercial,
      };
      const query = record
        ? contracts
            .from("service_contracts")
            .update(payload)
            .eq("id", record.id)
            .eq("updated_at", record.updated_at)
        : contracts.from("service_contracts").insert({ ...payload, client_id: client });
      const { data, error } = await query.select("id").maybeSingle();
      if (error)
        throw new Error(
          careUnavailable(error)
            ? errorMessage(error)
            : "Não foi possível salvar a minuta. Tente novamente.",
        );
      if (!data)
        throw new Error(
          "A minuta foi alterada em outra sessão. Reabra o registro antes de salvar.",
        );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a minuta.");
    } finally {
      setBusy(false);
    }
  };
  const print = () => {
    if (!printContract({ title, body }))
      setError("Permita a abertura da janela de impressão neste navegador e tente novamente.");
  };
  return (
    <MasterModal
      open
      wide
      busy={busy}
      onClose={onClose}
      title={record ? "Revisar contrato" : "Gerar contrato"}
      description={
        record
          ? "Revise a minuta salva, edite o texto ou imprima o documento completo."
          : "Selecione a empresa, confira as condições e gere o documento completo."
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Fechar
          </Button>
          <div className="flex flex-wrap gap-2">
            {step !== "condicoes" && (
              <Button variant="outline" disabled={busy || !body} onClick={print}>
                <Printer />
                Imprimir / PDF
              </Button>
            )}
            {step === "condicoes" ? (
              <Button
                className="dashboard-primary"
                type="submit"
                form="contract-editor"
                disabled={busy || loading || !company}
              >
                <FileText />
                {body ? "Gerar novamente" : "Gerar documento"}
              </Button>
            ) : (
              <SaveButton
                busy={busy || loading || !body}
                form="contract-editor"
                label="Salvar minuta"
              />
            )}
          </div>
        </div>
      }
    >
      <form
        id="contract-editor"
        className="clients-toolbar space-y-5"
        onSubmit={(e) => void submit(e)}
      >
        <fieldset disabled={busy} className="space-y-5">
          <div role="group" aria-label="Etapas do contrato" className="flex flex-wrap gap-2">
            {!record && (
              <Button
                type="button"
                variant={step === "condicoes" ? "default" : "ghost"}
                aria-pressed={step === "condicoes"}
                onClick={() => setStep("condicoes")}
              >
                <span className="sm:hidden">1. Dados</span>
                <span className="hidden sm:inline">1. Dados e condições</span>
              </Button>
            )}
            <Button
              type="button"
              variant={step === "previa" ? "default" : "ghost"}
              aria-pressed={step === "previa"}
              disabled={!body}
              onClick={() => setStep("previa")}
            >
              <span className="sm:hidden">{!record ? "2. " : ""}Prévia</span>
              <span className="hidden sm:inline">{!record ? "2. " : ""}Prévia do documento</span>
            </Button>
            {body && (
              <Button
                type="button"
                variant={step === "texto" ? "default" : "ghost"}
                aria-pressed={step === "texto"}
                aria-label="Editar texto"
                onClick={() => setStep("texto")}
              >
                <Pencil />
                <span className="hidden sm:inline">Editar texto</span>
              </Button>
            )}
          </div>
          {step === "condicoes" ? (
            <>
              <RemoteSelect
                label="Empresa contratante"
                value={client}
                onChange={setClient}
                required
                disabled={busy}
              />
              {loading && <p role="status">Carregando os dados da empresa…</p>}
              {company && (
                <>
                  <div className="rounded-xl border bg-secondary/30 p-4">
                    <p className="font-semibold">{company.legal_name || company.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {company.cnpj || "CNPJ pendente"} · {company.city}/{company.state}
                    </p>
                    <p className="mt-3 text-sm">
                      {plan?.name} · {plan && money(plan.monthlyCents * plan.months)} por ciclo (
                      {plan?.months} {plan?.months === 1 ? "mês" : "meses"})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      O plano e o valor vêm do cadastro da assinatura.
                    </p>
                  </div>
                  <section className="space-y-4">
                    <h3 className="font-semibold">Condições comerciais</h3>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0"
                        checked={Boolean(terms.startOnActivation)}
                        onChange={(e) =>
                          setTerms({ ...terms, startOnActivation: e.target.checked })
                        }
                      />
                      <span>
                        Iniciar o período de uso após assinatura e pagamento.
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Necessário para contratar por link. A primeira cobrança será apresentada
                          após a assinatura.
                        </span>
                      </span>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Início da vigência">
                        <input
                          type="date"
                          disabled={terms.startOnActivation}
                          value={terms.startsOn}
                          onChange={(e) => setTerms({ ...terms, startsOn: e.target.value })}
                        />
                      </Field>
                      <Field label="Primeiro vencimento">
                        <input
                          type="date"
                          disabled={terms.startOnActivation}
                          value={terms.firstDueOn}
                          onChange={(e) => setTerms({ ...terms, firstDueOn: e.target.value })}
                        />
                      </Field>
                      <Field label="Forma de pagamento">
                        <SystemSelect
                          value={terms.payment}
                          onChange={(e) =>
                            setTerms({
                              ...terms,
                              payment: e.target.value as ContractTerms["payment"],
                            })
                          }
                        >
                          <option value="a_definir">Definir depois</option>
                          <option value="pix">Pix</option>
                          <option value="boleto">Boleto bancário</option>
                          <option value="cartao">Cartão de crédito</option>
                        </SystemSelect>
                      </Field>
                      <Field label="Renovação">
                        <SystemSelect
                          value={terms.renewal}
                          onChange={(e) =>
                            setTerms({
                              ...terms,
                              renewal: e.target.value as ContractTerms["renewal"],
                            })
                          }
                        >
                          <option value="manual">Mediante nova confirmação</option>
                          <option value="automatica">Automática por períodos iguais</option>
                        </SystemSelect>
                      </Field>
                      <Field label="Canal de suporte">
                        <input
                          maxLength={200}
                          placeholder="E-mail, telefone ou canal de atendimento"
                          value={terms.supportChannel}
                          onChange={(e) => setTerms({ ...terms, supportChannel: e.target.value })}
                        />
                      </Field>
                      <Field label="Dias e horários de suporte">
                        <input
                          maxLength={200}
                          placeholder="Preencher quando definido"
                          value={terms.supportHours}
                          onChange={(e) => setTerms({ ...terms, supportHours: e.target.value })}
                        />
                      </Field>
                      <Field
                        label="Prazo para solicitar exportação (dias)"
                        hint="Após o encerramento. Deixe vazio enquanto a política não estiver definida."
                      >
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={terms.exportDays}
                          onChange={(e) => setTerms({ ...terms, exportDays: e.target.value })}
                        />
                      </Field>
                    </div>
                  </section>
                  <details className="rounded-xl border p-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Dados da TiNutri · preenchimento opcional nesta etapa
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Você pode completar depois. Campos vazios serão identificados como pendentes.
                      Estes dados compõem apenas esta minuta.
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["legalName", "Razão social da TiNutri"],
                          ["cnpj", "CNPJ da TiNutri"],
                          ["address", "Endereço da TiNutri"],
                          ["representative", "Representante da TiNutri"],
                          ["email", "E-mail da TiNutri"],
                          ["phone", "Telefone da TiNutri"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <input
                            type={key === "email" ? "email" : "text"}
                            maxLength={240}
                            value={provider[key]}
                            onChange={(e) => setProvider({ ...provider, [key]: e.target.value })}
                          />
                        </Field>
                      ))}
                    </div>
                  </details>
                </>
              )}
              <details className="rounded-xl border p-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Sobre o modelo de contrato</summary>
                <p className="mt-3 leading-relaxed">
                  Modelo inicial de licença de uso e serviços para o TiNutri Smart Label. Deve
                  passar por revisão jurídica e comercial antes do uso definitivo. Não inclui
                  consultoria nutricional ou fornecimento de equipamentos. Não há assinatura
                  eletrônica ou cobrança ao gerar a minuta.
                </p>
                <p className="mt-2">
                  Referências:{" "}
                  <a
                    className="underline"
                    href="https://www.planalto.gov.br/ccivil_03/leis/l9609.htm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Lei do Software
                  </a>
                  ,{" "}
                  <a
                    className="underline"
                    href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    LGPD
                  </a>{" "}
                  e{" "}
                  <a
                    className="underline"
                    href="https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CDC
                  </a>
                  .
                </p>
                <p className="mt-2">{CONTRACT_TEMPLATE_VERSION}</p>
              </details>
              {body && (
                <p className="text-xs text-muted-foreground">
                  Gerar novamente substitui as alterações feitas no texto. A minuta atual permanece
                  até você confirmar a geração.
                </p>
              )}
            </>
          ) : (
            <>
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Identificação e situação da minuta
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Título do documento">
                    <input
                      required
                      minLength={3}
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </Field>
                  <Field label="Situação da minuta">
                    <SystemSelect
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ServiceContract["status"])}
                    >
                      {Object.entries(CONTRACT_STATUS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </SystemSelect>
                  </Field>
                </div>
              </details>
              {pending.length > 0 && (
                <details className="rounded-xl border bg-secondary/30 p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {pending.length} campos pendentes · pode salvar como minuta
                  </summary>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {pending.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </details>
              )}
              {step === "previa" ? (
                <ContractPreview body={body} />
              ) : (
                <Field label="Conteúdo do contrato">
                  <textarea
                    required
                    minLength={20}
                    maxLength={30000}
                    rows={24}
                    className="w-full rounded-xl border bg-background p-3 text-sm leading-relaxed"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </Field>
              )}
              <p className="text-xs text-muted-foreground">
                Minuta para revisão. Para contratar por link, salve e use “Contratação por link” na
                lista. Salvar ou imprimir não registra aceite, assinatura ou pagamento.
                {record
                  ? " Os dados de origem foram preservados na criação; edições no cadastro não alteram este documento."
                  : ""}
              </p>
            </>
          )}
          <Feedback error={error} />
        </fieldset>
      </form>
    </MasterModal>
  );
}
function ContractPreview({ body }: { body: string }) {
  return (
    <article
      aria-label="Prévia do contrato"
      className="break-words rounded-xl border bg-background p-5 text-sm leading-relaxed sm:p-8"
    >
      <p className="mb-5 border-b pb-3 text-xs font-semibold uppercase tracking-wide text-primary">
        TiNutri Smart Label · minuta para revisão
      </p>
      {body.split(/\n\n+/).map((part, index) =>
        /^\d+\. [A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(part) ? (
          <section key={index} className="mb-5">
            <h3 className="mb-2 font-semibold">{part.split("\n")[0]}</h3>
            <p className="whitespace-pre-wrap">{part.split("\n").slice(1).join("\n")}</p>
          </section>
        ) : (
          <p key={index} className="mb-5 whitespace-pre-wrap">
            {part}
          </p>
        ),
      )}
    </article>
  );
}
