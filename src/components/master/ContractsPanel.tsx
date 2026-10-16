import { ContractEditor } from "./ContractEditor";
import { useCallback, useState } from "react";
import { Download, FileText, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import { PageLoading, PaginationControls } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { errorMessage } from "@/lib/management";
import { searchPattern } from "@/lib/list-query";
import { displayDate } from "@/lib/billing";
import {
  contracts,
  downloadContract,
  printContract,
  CONTRACT_STATUS,
  type ServiceContract,
} from "@/lib/contracts";
import { Heading, Field, Feedback } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
export function ContractsPanel({
  initialClient = "",
  revision,
}: {
  initialClient?: string;
  revision: number;
}) {
  const [client, setClient] = useState(initialClient);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<ServiceContract | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const term = useDebouncedValue(search.trim());
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      let query = contracts
        .from("service_contracts")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (client) query = query.eq("client_id", client);
      if (status) query = query.eq("status", status as ServiceContract["status"]);
      if (term) query = query.filter("title", "imatch", searchPattern(term));
      const { data, error, count } = await query;
      if (error) throw new Error(errorMessage(error));
      if (count === null) throw new Error("Contagem indisponível.");
      return { rows: data ?? [], total: count };
    },
    [client, status, term],
  );
  const listing = usePaginatedQuery(JSON.stringify([client, status, term]), load, revision);
  return (
    <section className="space-y-6">
      <Heading
        title="Contratos"
        description="Minutas e condições comerciais por empresa. O aceite e a assinatura eletrônica ainda não estão disponíveis."
        action={
          <Button className="dashboard-primary" onClick={() => setEditing(null)}>
            <Plus />
            Gerar contrato
          </Button>
        }
      />
      <div className="clients-toolbar grid items-end gap-4 rounded-2xl border bg-card p-4 md:grid-cols-3">
        <RemoteSelect label="Empresa" value={client} onChange={setClient} />
        <Field label="Título">
          <input
            placeholder="Buscar minuta"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Situação da minuta">
          <SystemSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(CONTRACT_STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SystemSelect>
        </Field>
        {(client || search || status) && (
          <Button
            variant="ghost"
            className="justify-self-start"
            onClick={() => {
              setClient("");
              setSearch("");
              setStatus("");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>
      <Feedback notice={notice} />
      {listing.loading || listing.error ? (
        <PageLoading error={listing.error} retry={listing.reload} />
      ) : !listing.rows.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Nenhuma minuta encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione uma empresa em “Gerar contrato” para preparar o documento completo, ou ajuste
            os filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listing.rows.map((row) => (
            <article key={row.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="break-words font-semibold">{row.title}</h2>
                <span className="client-plan">{CONTRACT_STATUS[row.status]}</span>
              </div>
              {row.company_snapshot &&
                typeof row.company_snapshot === "object" &&
                !Array.isArray(row.company_snapshot) &&
                typeof row.company_snapshot.name === "string" && (
                  <p className="mt-2 text-sm text-muted-foreground">{row.company_snapshot.name}</p>
                )}
              <p className="mt-2 text-xs text-muted-foreground">
                Criada em {displayDate(row.created_at)} · Atualizada em{" "}
                {displayDate(row.updated_at)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditing(row)}>
                  Abrir e revisar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!printContract(row))
                      setNotice(
                        "Permita a abertura da janela de impressão no navegador e tente novamente.",
                      );
                  }}
                >
                  <Printer />
                  Imprimir / PDF
                </Button>
                <Button variant="ghost" onClick={() => downloadContract(row)}>
                  <Download />
                  Baixar minuta
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <PaginationControls
        page={listing.page}
        size={listing.size}
        total={listing.total}
        loading={listing.loading}
        onPageChange={listing.setPage}
        onSizeChange={listing.setSize}
      />
      {editing !== undefined && (
        <ContractEditor
          record={editing}
          initialClient={client}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setNotice("Minuta salva.");
            listing.reload();
          }}
        />
      )}
    </section>
  );
}
