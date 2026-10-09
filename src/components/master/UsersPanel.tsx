import { SystemSelect } from "@/components/ui/system-select";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import { UserPlus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaginationControls, PageLoading } from "@/components/PaginationControls";
import { useDebouncedValue, usePaginatedQuery } from "@/hooks/use-paginated-query";
import { createUser, resetUserPassword } from "@/lib/admin.functions";
import {
  management,
  pageResult,
  ROLE_NAMES,
  errorMessage,
  type MasterUser,
} from "@/lib/management";
import { searchPattern } from "@/lib/list-query";
import { Heading, MasterModal, Field, Feedback, SaveButton } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
const EMPTY = { name: "", email: "", role: "operator", client_id: "", password: "" };
const PERMISSIONS: Record<string, string> = {
  admin_master: "Gerencia todas as empresas, usuários e permissões.",
  nutricionista: "Acompanha e gerencia as empresas vinculadas à própria carteira.",
  admin_cliente: "Administra os cadastros da empresa vinculada.",
  gerente: "Gerencia a operação e os cadastros da empresa vinculada.",
  operator: "Emite etiquetas e acompanha validades e histórico da empresa.",
};
export function UsersPanel({
  revision,
  initialClient = "",
  focusedId = null,
  onChanged,
  onActivity,
}: {
  revision: number;
  initialClient?: string;
  focusedId?: string | null;
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
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [client, setClient] = useState(initialClient);
  const term = useDebouncedValue(search);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<MasterUser | null>(null);
  const [recovery, setRecovery] = useState<MasterUser | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formId = useId();
  const load = useCallback(
    async (offset: number, size: number, signal: AbortSignal) => {
      const { data, error } = await management
        .rpc("master_directory", {
          p_kind: "usuarios",
          p_search: searchPattern(term),
          p_filter: role,
          p_client: client || null,
          p_offset: offset,
          p_limit: size,
        })
        .abortSignal(signal);
      if (error) throw new Error(errorMessage(error));
      return pageResult<MasterUser>(data);
    },
    [term, role, client],
  );
  const list = usePaginatedQuery(JSON.stringify([term, role, client]), load, revision);
  const edit = useCallback((user: MasterUser) => {
    setTarget(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role ?? "operator",
      client_id: user.client_id ?? "",
      password: "",
    });
    setError("");
    setOpen(true);
  }, []);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedId || applied.current === focusedId) return;
    const abort = new AbortController();
    void management
      .rpc("master_directory", {
        p_kind: "usuarios",
        p_search: searchPattern(focusedId),
        p_limit: 1,
      })
      .abortSignal(abort.signal)
      .then(({ data, error }) => {
        if (abort.signal.aborted) return;
        applied.current = focusedId;
        if (error) {
          setError(errorMessage(error));
          return;
        }
        const record = pageResult<MasterUser>(data).rows.find((row) => row.user_id === focusedId);
        if (record) edit(record);
        else setError("Não foi possível abrir este acesso.");
      });
    return () => abort.abort();
  }, [focusedId, edit]);
  const needsClient = ["operator", "gerente", "admin_cliente"].includes(form.role);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (target) {
        const { error } = await management.rpc("master_update_access", {
          p_user: target.user_id,
          p_name: form.name.trim(),
          p_role: form.role,
          p_client: needsClient ? form.client_id : null,
        });
        if (error) throw new Error(error.code === "P0001" ? error.message : errorMessage(error));
      } else {
        const result = await createUser({
          data: {
            name: form.name.trim(),
            email: form.email.trim(),
            role: form.role as
              | "admin_master"
              | "nutricionista"
              | "admin_cliente"
              | "gerente"
              | "operator",
            clientId: needsClient ? form.client_id : null,
            password: form.password || undefined,
          },
        });
        if (result?.ok !== true || !result.userId)
          throw new Error(
            "O servidor não confirmou a criação do usuário. Atualize a lista antes de tentar novamente.",
          );
        await onActivity(
          "usuario_criado",
          needsClient ? form.client_id : null,
          "user",
          result.userId,
          form.name,
          {},
          { name: form.name, role: form.role, client_id: needsClient ? form.client_id : null },
        );
      }
      setOpen(false);
      setNotice(
        target
          ? "Permissões atualizadas."
          : form.password
            ? "Usuário criado com senha inicial."
            : "Usuário criado e convite solicitado por e-mail.",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const recover = async () => {
    if (!recovery || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await resetUserPassword({ data: { userId: recovery.user_id } });
      if (result?.ok !== true)
        throw new Error("O servidor não confirmou a solicitação de recuperação. Tente novamente.");
      await onActivity(
        "recuperacao_solicitada",
        recovery.client_id,
        "user",
        recovery.user_id,
        recovery.name,
        {},
        {},
      );
      setNotice(`Recuperação de acesso solicitada para ${recovery.email}.`);
      setRecovery(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <section className="clients-page space-y-6">
      <Heading
        title="Usuários"
        description="Organize os acessos e acompanhe convites e perfis de permissão."
        action={
          <Button
            className="dashboard-primary"
            onClick={() => {
              setTarget(null);
              setForm({ ...EMPTY, client_id: client });
              setError("");
              setOpen(true);
            }}
          >
            <UserPlus />
            Novo usuário
          </Button>
        }
      />
      <div className="master-filter-grid rounded-2xl border bg-card p-4">
        <Field label="Pesquisar usuários">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou e-mail"
          />
        </Field>
        <Field label="Perfil">
          <SystemSelect value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROLE_NAMES)
              .filter(([key]) => key !== "admin")
              .map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
          </SystemSelect>
        </Field>
        <RemoteSelect label="Empresa" value={client} onChange={setClient} />
      </div>
      <Feedback error={!open && !recovery ? error : undefined} notice={notice} />
      {list.loading || list.error ? (
        <PageLoading error={list.error} retry={list.reload} />
      ) : !list.rows.length ? (
        <div className="master-empty">Nenhum usuário neste filtro.</div>
      ) : (
        <div className="grid gap-3">
          {list.rows.map((user) => (
            <article key={user.user_id} className="master-list-row">
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-semibold">{user.name}</h2>
                <p className="mt-1 break-words text-xs text-muted-foreground">{user.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="master-tag">
                    {ROLE_NAMES[user.role ?? ""] ?? "Sem perfil atribuído"}
                  </span>
                  <span
                    className={`master-tag ${user.access_status === "ativo" ? "is-green" : "is-orange"}`}
                  >
                    {{
                      ativo: "Acesso realizado",
                      convidado: "Convite pendente",
                      primeiro_acesso: "Aguardando primeiro acesso",
                      sem_conta: "Sem conta vinculada",
                    }[user.access_status] ?? "Não informado"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {user.company_name ?? "Sem empresa fixa"}
                  {user.last_sign_in_at
                    ? ` · Último acesso: ${format(new Date(user.last_sign_in_at), "dd/MM/yyyy HH:mm")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => edit(user)}>
                  Editar acesso
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setError("");
                    setRecovery(user);
                  }}
                >
                  Recuperar acesso
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
          label="usuários"
        />
      )}
      <MasterModal
        title={target ? "Editar acesso" : "Novo usuário"}
        description="Defina o perfil e a empresa. A senha inicial é opcional; sem ela será solicitado um convite."
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SaveButton form={formId} busy={busy} />
          </div>
        }
      >
        <form id={formId} onSubmit={save}>
          <fieldset disabled={busy} className="space-y-4">
            <Field label="Nome *">
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))}
              />
            </Field>
            <Field label="E-mail *">
              <input
                type="email"
                required
                disabled={Boolean(target)}
                maxLength={255}
                value={form.email}
                onChange={(e) => setForm((old) => ({ ...old, email: e.target.value }))}
              />
            </Field>
            <Field label="Perfil *">
              <SystemSelect
                value={form.role}
                onChange={(e) => setForm((old) => ({ ...old, role: e.target.value }))}
              >
                {Object.entries(ROLE_NAMES)
                  .filter(([key]) => key !== "admin")
                  .map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
              </SystemSelect>
            </Field>
            <p className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-primary">
              <ShieldCheck className="size-4 shrink-0" />
              {PERMISSIONS[form.role]}
            </p>
            {target?.role === "nutricionista" && form.role !== "nutricionista" && (
              <p className="clients-error text-xs">
                Ao mudar este perfil, os vínculos da carteira serão removidos.
              </p>
            )}
            {needsClient && (
              <RemoteSelect
                label="Empresa vinculada *"
                required
                value={form.client_id}
                onChange={(value) => setForm((old) => ({ ...old, client_id: value }))}
              />
            )}{" "}
            {!target && (
              <Field
                label="Senha inicial (opcional)"
                hint="Deixe em branco para solicitar convite por e-mail."
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={form.password}
                  onChange={(e) => setForm((old) => ({ ...old, password: e.target.value }))}
                />
              </Field>
            )}
            <Feedback error={error} />
          </fieldset>
        </form>
      </MasterModal>
      <MasterModal
        title="Recuperar acesso"
        description="Confirme o destinatário antes de solicitar o e-mail de recuperação."
        open={Boolean(recovery)}
        onClose={() => setRecovery(null)}
        busy={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setRecovery(null)}>
              Cancelar
            </Button>
            <Button className="dashboard-primary" disabled={busy} onClick={() => void recover()}>
              {busy ? "Solicitando…" : "Solicitar recuperação"}
            </Button>
          </div>
        }
      >
        <p className="break-words font-medium">{recovery?.name}</p>
        <p className="mt-2 break-words text-sm text-muted-foreground">{recovery?.email}</p>
        <Feedback error={error} />
      </MasterModal>
    </section>
  );
}
