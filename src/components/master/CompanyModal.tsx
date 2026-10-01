import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClientQrCard } from "@/components/ClientQrCard";
import { PageLoading } from "@/components/PaginationControls";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { management, errorMessage, type Company, type Summary } from "@/lib/management";
import { supabase } from "@/integrations/supabase/client";
import { MasterModal, Feedback } from "./Shared";
import { summaryArgs } from "@/lib/management";
export function CompanyModal({
  company,
  revision,
  onClose,
  onEdit,
  onSection,
  onChanged,
  onActivity,
}: {
  company: Company;
  revision: number;
  onClose: () => void;
  onEdit: () => void;
  onSection: (section: "usuarios" | "atividades" | "acompanhamento") => void;
  onChanged: () => void;
  onActivity: (
    action: string,
    client: string | null,
    entity: string,
    id: string,
    name: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    async (_offset: number, _size: number, signal: AbortSignal) => {
      const { data, error } = await management
        .rpc("master_summary", summaryArgs(company.id))
        .abortSignal(signal);
      if (error) throw new Error(errorMessage(error));
      return { rows: [data as unknown as Summary], total: 1 };
    },
    [company.id],
  );
  const query = usePaginatedQuery(company.id, load, revision);
  const summary = query.rows[0];
  const status = company.status === "ativa" ? "suspensa" : "ativa";
  const change = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("clients")
        .update({ status, active: status === "ativa" })
        .eq("id", company.id)
        .eq("status", company.status)
        .select("id")
        .maybeSingle();
      if (error || !data)
        throw new Error("Não foi possível alterar a situação. Atualize a ficha e tente novamente.");
      await onActivity(
        status === "suspensa" ? "cliente_suspenso" : "cliente_reativado",
        company.id,
        "client",
        company.id,
        company.name,
        { status: company.status },
        { status },
      );
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar a situação.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MasterModal
      open
      onClose={onClose}
      busy={busy}
      wide
      title={company.name}
      description="Ficha da empresa: contatos, acompanhamento e acessos à operação."
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>
            {status === "ativa" ? "Reativar empresa" : "Suspender empresa"}
          </Button>
          <span className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Fechar
            </Button>
            <Button className="dashboard-primary" disabled={busy} onClick={onEdit}>
              Editar empresa
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="break-words font-medium">{company.legal_name || company.name}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {company.cnpj || "CNPJ não informado"} · {company.city} / {company.state}
          </p>
          <p className="mt-2 text-xs">
            Situação: {company.status} · Plano: {company.plan}
          </p>
          <p className="mt-2 text-xs">
            Nutricionista: {company.nutritionists?.join(", ") || "Consulte os vínculos em Carteira"}
          </p>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {[
            ["Contato", company.responsible_name],
            ["E-mail", company.email],
            ["Telefone", company.phone],
            ["Endereço", company.address],
          ].map(([name, value]) => (
            <div key={name}>
              <dt className="text-xs text-muted-foreground">{name}</dt>
              <dd className="mt-1 break-words">{value || "Não informado"}</dd>
            </div>
          ))}
        </dl>
        {query.loading || query.error ? (
          <PageLoading error={query.error} retry={query.reload} />
        ) : (
          summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Produtos", summary.products],
                ["Colaboradores", summary.team],
                ["Vencidas", summary.expired],
                ["Pendências", summary.open],
              ].map(([name, value]) => (
                <div key={String(name)} className="rounded-xl border p-3">
                  <strong className="text-2xl">{value}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">{name}</p>
                </div>
              ))}
            </div>
          )
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => onSection("usuarios")}>
            Equipe e acessos
          </Button>
          <Button variant="outline" onClick={() => onSection("acompanhamento")}>
            Acompanhamento profissional
          </Button>
          <Button asChild variant="outline">
            <a href={`/?empresa=${company.id}&painel=products`}>Catálogo de produtos</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/?empresa=${company.id}&painel=validades`}>Etiquetas e validades</a>
          </Button>
          <Button variant="outline" onClick={() => onSection("atividades")}>
            Atividades da empresa
          </Button>
          <Button asChild variant="outline">
            <a href={`/?empresa=${company.id}&painel=history`}>Histórico da empresa</a>
          </Button>
        </div>
        {company.public_code && (
          <ClientQrCard clientName={company.name} publicCode={company.public_code} />
        )}
        <Feedback error={error} />
        {confirm && (
          <div className="clients-error">
            <p>
              {status === "suspensa"
                ? "Suspender bloqueia a operação desta empresa. Confirma a alteração?"
                : "Reativar libera a operação desta empresa. Confirma a alteração?"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
                Cancelar alteração
              </Button>
              <Button
                variant={status === "suspensa" ? "destructive" : "default"}
                disabled={busy}
                onClick={() => void change()}
              >
                Confirmar alteração
              </Button>
            </div>
          </div>
        )}
      </div>
    </MasterModal>
  );
}
