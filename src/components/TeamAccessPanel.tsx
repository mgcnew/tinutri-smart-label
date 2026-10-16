import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SystemSelect } from "@/components/ui/system-select";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSIONS, type AppRole, type Permission, type Permissions } from "@/lib/permissions";
import { inviteTeamMember } from "@/lib/team.functions";

type Rpc = (
  name: string,
  args?: object,
) => Promise<{ data: unknown; error: { message?: string } | null }>;
const rpc: Rpc = (name, args) => (supabase as unknown as { rpc: Rpc }).rpc(name, args);

type Member = {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  manageable: boolean;
  overrides: Partial<Record<Permission, boolean>>;
  effective: Permissions;
};

const ROLE_NAME: Record<string, string> = {
  admin_cliente: "Administrador da empresa",
  gerente: "Gerente",
  operator: "Colaborador",
};

export function TeamAccessPanel({
  clientId,
  role,
  permissions,
}: {
  clientId: string | null;
  role: AppRole;
  permissions: Permissions;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "operator" as "operator" | "gerente",
  });
  const [inviting, setInviting] = useState(false);
  // Só o administrador da empresa convida gerentes; gerente convida colaboradores.
  const canInviteManager = role === "admin_cliente";

  const load = useCallback(async () => {
    if (!clientId) return;
    setError("");
    const { data, error: failure } = await rpc("company_team", { p_client: clientId });
    if (failure) {
      setError(
        "Não foi possível carregar a equipe. Se isso persistir, as permissões ainda não foram ativadas no banco.",
      );
      setMembers([]);
      return;
    }
    setMembers((data ?? []) as Member[]);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    key: string,
    work: () => Promise<{ error: { message?: string } | null }>,
    success?: string,
  ) => {
    setBusy(key);
    setNotice(null);
    const { error: failure } = await work();
    setBusy(null);
    if (failure) {
      setNotice({
        text:
          failure.message?.startsWith("Sem permissão") ||
          failure.message?.startsWith("Você") ||
          failure.message?.startsWith("Só")
            ? failure.message
            : "Não foi possível salvar. Tente novamente.",
        error: true,
      });
      return;
    }
    if (success) setNotice({ text: success, error: false });
    await load();
  };

  const setPermission = (member: Member, permission: Permission, granted: boolean | null) =>
    act(`${member.user_id}:${permission}`, () =>
      rpc("set_member_permission", {
        p_user: member.user_id,
        p_permission: permission,
        p_granted: granted,
      }),
    );

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientId || inviting) return;
    setInviting(true);
    setNotice(null);
    try {
      await inviteTeamMember({
        data: { clientId, name: form.name.trim(), email: form.email.trim(), role: form.role },
      });
      setNotice({
        text: `Convite enviado para ${form.email.trim()}. A pessoa define a senha pelo e-mail.`,
        error: false,
      });
      setForm({ name: "", email: "", role: "operator" });
      await load();
    } catch (failure) {
      setNotice({
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "Não foi possível enviar o convite.",
        error: true,
      });
    } finally {
      setInviting(false);
    }
  };

  if (!clientId)
    return (
      <p className="text-sm text-muted-foreground">Sua conta não está vinculada a uma empresa.</p>
    );

  return (
    <section className="space-y-6">
      <header className="dashboard-heading">
        <div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Equipe e acessos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Convide pessoas da sua empresa e escolha o que cada uma pode fazer. Tudo fica registrado
            no histórico de atividades.
          </p>
        </div>
      </header>

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={notice.error ? "clients-error" : "clients-notice"}
        >
          {notice.text}
        </p>
      )}

      <form
        onSubmit={invite}
        className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end sm:p-6"
      >
        <label className="block min-w-0">
          <span className="mb-2 block text-xs font-medium">Nome</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-xs font-medium">E-mail</span>
          <input
            required
            type="email"
            maxLength={255}
            value={form.email}
            onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-xs font-medium">Perfil</span>
          <SystemSelect
            value={form.role}
            onChange={(event) =>
              setForm((old) => ({ ...old, role: event.target.value as "operator" | "gerente" }))
            }
          >
            <option value="operator">Colaborador</option>
            {canInviteManager && <option value="gerente">Gerente</option>}
          </SystemSelect>
        </label>
        <Button type="submit" disabled={inviting} className="sm:min-w-36">
          {inviting ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Convidar
        </Button>
      </form>

      {error && (
        <p role="alert" className="clients-error">
          {error}
        </p>
      )}
      {members === null && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando equipe…
        </p>
      )}

      <div className="space-y-4">
        {members?.map((member) => (
          <article
            key={member.user_id}
            className={`rounded-2xl border bg-card p-5 sm:p-6 ${member.active ? "" : "opacity-70"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{member.name}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email ?? "Sem e-mail"} · {ROLE_NAME[member.role] ?? member.role}
                  {member.active ? "" : " · Desativado"}
                </p>
              </div>
              {member.manageable && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === member.user_id}
                  onClick={() =>
                    void act(
                      member.user_id,
                      () =>
                        rpc("set_member_active", {
                          p_user: member.user_id,
                          p_active: !member.active,
                        }),
                      member.active
                        ? `${member.name} foi desativado(a): não acessa mais o sistema.`
                        : `${member.name} foi reativado(a).`,
                    )
                  }
                >
                  {member.active ? "Desativar acesso" : "Reativar acesso"}
                </Button>
              )}
            </div>
            {member.manageable && member.active ? (
              <ul className="mt-4 divide-y">
                {PERMISSIONS.filter(
                  (item) => item.id !== "gerir_acessos" || role === "admin_cliente",
                ).map((item) => {
                  const override = member.overrides[item.id];
                  const checked = member.effective[item.id];
                  // Quem gerencia não concede o que não tem.
                  const locked = !permissions[item.id] && !checked;
                  return (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                          {override === undefined ? " · padrão do perfil" : " · ajustado"}
                        </p>
                      </div>
                      {override !== undefined && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void setPermission(member, item.id, null)}
                        >
                          Padrão
                        </Button>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-label={item.label}
                        disabled={busy !== null || locked}
                        onClick={() => void setPermission(member, item.id, !checked)}
                        className="grid min-h-11 min-w-11 place-items-center disabled:opacity-50"
                      >
                        <Switch
                          checked={checked}
                          tabIndex={-1}
                          aria-hidden="true"
                          className="pointer-events-none"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              !member.manageable && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Você não gerencia o acesso desta pessoa.
                </p>
              )
            )}
          </article>
        ))}
        {members?.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">Nenhuma pessoa encontrada na equipe.</p>
        )}
      </div>
    </section>
  );
}
