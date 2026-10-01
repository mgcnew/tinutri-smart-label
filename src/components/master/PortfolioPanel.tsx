import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { PaginationControls, PageLoading } from "@/components/PaginationControls";
import { usePaginatedQuery, useDebouncedValue } from "@/hooks/use-paginated-query";
import { management, pageResult, errorMessage, type MasterUser } from "@/lib/management";
import { searchPattern } from "@/lib/list-query";
import { supabase } from "@/integrations/supabase/client";
import { assignNutritionistClient, removeNutritionistClient } from "@/lib/admin.functions";
import { Heading, MasterModal, Field, Feedback } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
export function PortfolioPanel({
  revision,
  onChanged,
  onActivity,
  onCompany,
}: {
  revision: number;
  onChanged: () => void;
  onCompany: (id: string) => void;
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
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search);
  const [target, setTarget] = useState<MasterUser | null>(null);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const { data, error } = await management
        .rpc("master_directory", {
          p_kind: "carteira",
          p_search: searchPattern(term),
          p_offset: offset,
          p_limit: size,
        })
        .abortSignal(signal);
      if (error) throw new Error(errorMessage(error));
      return pageResult<MasterUser>(data);
    },
    [term],
  );
  const list = usePaginatedQuery(term, load, revision);
  return (
    <section className="clients-page space-y-6">
      <Heading
        title="Carteira profissional"
        description="Distribua as empresas e acompanhe a carga de atendimento de cada nutricionista."
      />
      <div className="rounded-2xl border bg-white p-4">
        <Field label="Pesquisar nutricionista">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou e-mail"
          />
        </Field>
      </div>
      {list.loading || list.error ? (
        <PageLoading error={list.error} retry={list.reload} />
      ) : !list.rows.length ? (
        <div className="master-empty">
          Nenhuma nutricionista encontrada. Cadastre o perfil na área Usuários.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.rows.map((user) => (
            <article key={user.user_id} className="rounded-2xl border bg-white p-5">
              <h2 className="break-words font-semibold">{user.name}</h2>
              <p className="mt-1 break-words text-xs text-muted-foreground">{user.email}</p>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-sm">
                  <strong className="text-2xl">{user.client_count}</strong> empresas
                </p>
                <Button variant="outline" onClick={() => setTarget(user)}>
                  Gerenciar carteira
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!list.error && (
        <PaginationControls
          page={list.page}
          size={list.size}
          total={list.total}
          loading={list.loading}
          onPageChange={list.setPage}
          onSizeChange={list.setSize}
          label="nutricionistas"
        />
      )}
      {target && (
        <PortfolioModal
          user={target}
          revision={revision}
          onClose={() => setTarget(null)}
          onChanged={onChanged}
          onActivity={onActivity}
          onCompany={onCompany}
        />
      )}
    </section>
  );
}
function PortfolioModal({
  user,
  revision,
  onClose,
  onChanged,
  onActivity,
  onCompany,
}: {
  user: MasterUser;
  revision: number;
  onClose: () => void;
  onChanged: () => void;
  onCompany: (id: string) => void;
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
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<{ client_id: string; name: string } | null>(null);
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const { data, count, error } = await supabase
        .from("nutritionist_clients")
        .select("client_id,company:clients(name,status)", { count: "exact" })
        .eq("nutritionist_user_id", user.user_id)
        .order("client_id")
        .range(offset, offset + size - 1)
        .abortSignal(signal);
      if (error || count === null) throw error ?? new Error("Count");
      return { rows: data ?? [], total: count };
    },
    [user.user_id],
  );
  const list = usePaginatedQuery(user.user_id, load, revision);
  const change = async (remove: boolean) => {
    if (busy) return;
    const id = remove ? removing?.client_id : client;
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const result = remove
        ? await removeNutritionistClient({
            data: { nutritionistUserId: user.user_id, clientId: id },
          })
        : await assignNutritionistClient({
            data: { nutritionistUserId: user.user_id, clientId: id },
          });
      if (result?.ok !== true)
        throw new Error(
          "O servidor não confirmou a alteração da carteira. Atualize a lista antes de tentar novamente.",
        );
      await onActivity(
        remove ? "carteira_removida" : "carteira_vinculada",
        id,
        "client",
        id,
        user.name,
        { nutritionist_user_id: remove ? user.user_id : null },
        { nutritionist_user_id: remove ? null : user.user_id },
      );
      setRemoving(null);
      setClient("");
      setNotice(remove ? "Empresa removida da carteira." : "Vínculo atualizado com sucesso.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o vínculo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MasterModal
      wide
      open
      title={`Carteira de ${user.name}`}
      description="Vincule empresas ou revise os vínculos atuais. A remoção retira o acesso da nutricionista à empresa."
      onClose={onClose}
      busy={busy}
      footer={
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <RemoteSelect
          label="Empresa para vincular"
          value={client}
          onChange={setClient}
          disabled={busy}
        />
        <Button
          className="dashboard-primary"
          disabled={!client || busy}
          onClick={() => void change(false)}
        >
          Vincular empresa
        </Button>
        <Feedback error={error} notice={notice} />
        {removing && (
          <div className="clients-error">
            <p>Remover o acesso a {removing.name}?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>
                Cancelar remoção
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => void change(true)}>
                Confirmar remoção
              </Button>
            </div>
          </div>
        )}
        {list.loading || list.error ? (
          <PageLoading error={list.error} retry={list.reload} />
        ) : !list.rows.length ? (
          <div className="master-empty">Nenhuma empresa vinculada.</div>
        ) : (
          list.rows.map((row) => (
            <article
              key={row.client_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {row.company?.name ?? "Empresa não encontrada"}
                </p>
                <p className="text-xs text-muted-foreground">{row.company?.status}</p>
              </div>
              <span className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onCompany(row.client_id);
                  }}
                >
                  Ficha
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setRemoving({
                      client_id: row.client_id,
                      name: row.company?.name ?? "esta empresa",
                    })
                  }
                >
                  Remover vínculo
                </Button>
              </span>
            </article>
          ))
        )}
        {!list.error && (
          <PaginationControls
            page={list.page}
            size={list.size}
            total={list.total}
            loading={list.loading}
            onPageChange={list.setPage}
            onSizeChange={list.setSize}
            label="empresas"
          />
        )}
      </div>
    </MasterModal>
  );
}
