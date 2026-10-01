import { createFileRoute, Link } from "@tanstack/react-router";
import { cloneElement, useEffect, useId, useMemo, useState } from "react";

import { ClientQrCard } from "@/components/ClientQrCard";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  assignNutritionistClient,
  createUser,
  listAllClients,
  listAllUsers,
  listCarteira,
  masterStats,
  removeNutritionistClient,
  resetUserPassword,
  setClientStatus,
  upsertClient,
} from "@/lib/admin.functions";
import { listActivity } from "@/lib/activity.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Área Master · TiNutri Smart Label®" }] }),
  component: AdminMaster,
});

type ClientRow = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  city: string;
  state: string;
  status: "ativa" | "inativa" | "suspensa";
  responsible_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  plan?: string | null;
  public_code?: string | null;
};
type UserRow = {
  user_id: string;
  name: string;
  email: string;
  client_id: string | null;
  role: string | null;
};
type Stats = Awaited<ReturnType<typeof masterStats>>;
type ActivityRow = Awaited<ReturnType<typeof listActivity>>[number];

function AdminMaster() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [carteira, setCarteira] = useState<{ nutritionist_user_id: string; client_id: string }[]>(
    [],
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"empresas" | "usuarios" | "carteira" | "atividades">("empresas");

  const refresh = async () => {
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle();
      const raw = roleRow?.role as string | undefined;
      const isMaster = raw === "admin_master" || raw === "admin";
      setAuthorized(isMaster);
      if (!isMaster) {
        setLoading(false);
        return;
      }
      const [c, u, k, s, a] = await Promise.all([
        listAllClients(),
        listAllUsers(),
        listCarteira(),
        masterStats(),
        listActivity({ data: { limit: 100 } }),
      ]);
      setClients(c as ClientRow[]);
      setUsers(u as UserRow[]);
      setCarteira(k);
      setStats(s);
      setActivity(a as ActivityRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="font-semibold text-muted-foreground">Carregando área master…</p>
      </main>
    );
  if (authorized === false)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-5">
        <section className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-xl">
          <h1 className="text-2xl font-bold">Acesso não autorizado.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Esta área é restrita ao time TiNutri.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/">Voltar para o início</Link>
          </Button>
        </section>
      </main>
    );

  return (
    <main className="master-panel mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Admin Master TiNutri
          </p>
          <h1 className="text-3xl font-bold">Painel master</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/">Voltar ao app</Link>
          </Button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {stats && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Empresas" value={stats.totals.clients} />
          <Stat label="Produtos ativos" value={stats.totals.products} />
          <Stat label="Colaboradores ativos" value={stats.totals.collaborators} />
          <Stat label="Etiquetas emitidas" value={stats.totals.labels} />
        </section>
      )}

      <nav
        aria-label="Seções da Área Master"
        className="master-tabs grid grid-cols-2 gap-2 rounded-xl border bg-card p-2 sm:grid-cols-4"
      >
        {(["empresas", "usuarios", "carteira", "atividades"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-11 min-w-0 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
          >
            {
              {
                empresas: "Empresas",
                usuarios: "Usuários",
                carteira: "Carteira",
                atividades: "Atividades",
              }[t]
            }
          </button>
        ))}
      </nav>

      {tab === "empresas" && <EmpresasTab clients={clients} stats={stats} onChanged={refresh} />}
      {tab === "usuarios" && <UsuariosTab clients={clients} users={users} onChanged={refresh} />}
      {tab === "carteira" && (
        <CarteiraTab clients={clients} users={users} carteira={carteira} onChanged={refresh} />
      )}
      {tab === "atividades" && <AtividadesTab rows={activity} />}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="master-stat-value mt-1 text-3xl font-bold tabular-nums">
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function EmpresasTab({
  clients,
  stats,
  onChanged,
}: {
  clients: ClientRow[];
  stats: Stats | null;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    legal_name: string;
    cnpj: string;
    city: string;
    state: string;
    responsible_name: string;
    email: string;
    phone: string;
    address: string;
    plan: string;
    status: ClientRow["status"];
  }>({
    name: "",
    legal_name: "",
    cnpj: "",
    city: "",
    state: "",
    responsible_name: "",
    email: "",
    phone: "",
    address: "",
    plan: "essencial",
    status: "ativa",
  });
  const [saving, setSaving] = useState(false);
  const perClient = useMemo(() => new Map((stats?.perClient ?? []).map((x) => [x.id, x])), [stats]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertClient({
        data: { ...form, legal_name: form.legal_name || null, cnpj: form.cnpj || null },
      });
      setForm({
        name: "",
        legal_name: "",
        cnpj: "",
        city: "",
        state: "",
        responsible_name: "",
        email: "",
        phone: "",
        address: "",
        plan: "essencial",
        status: "ativa",
      });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const edit = (c: ClientRow) =>
    setForm({
      id: c.id,
      name: c.name,
      legal_name: c.legal_name ?? "",
      cnpj: c.cnpj ?? "",
      city: c.city,
      state: c.state,
      responsible_name: c.responsible_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      plan: c.plan ?? "essencial",
      status: c.status,
    });

  return (
    <section className="space-y-4">
      <form
        onSubmit={save}
        className="master-form grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Nome fantasia">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Razão social">
          <input
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
        </Field>
        <Field label="CNPJ">
          <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
        </Field>
        <Field label="Cidade">
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="UF">
          <input
            maxLength={2}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Responsável">
          <input
            value={form.responsible_name}
            onChange={(e) => setForm({ ...form, responsible_name: e.target.value })}
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Telefone">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Endereço">
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <Field label="Plano">
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="essencial">Essencial</option>
            <option value="profissional">Profissional</option>
            <option value="premium">Premium</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ClientRow["status"] })}
          >
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="suspensa">Suspensa</option>
          </select>
        </Field>
        <div className="master-form-actions sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Cadastrar empresa"}
          </Button>
          {form.id && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setForm({
                  name: "",
                  legal_name: "",
                  cnpj: "",
                  city: "",
                  state: "",
                  responsible_name: "",
                  email: "",
                  phone: "",
                  address: "",
                  plan: "essencial",
                  status: "ativa",
                })
              }
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="master-records min-w-0 rounded-2xl border bg-card">
        <table className="master-table w-full text-sm">
          <caption className="sr-only">Empresas cadastradas</caption>
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Empresa</th>
              <th className="p-3">CNPJ</th>
              <th className="p-3">Cidade/UF</th>
              <th className="p-3">Status</th>
              <th className="p-3">Etiquetas</th>
              <th className="master-row-actions p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const s = perClient.get(c.id);
              return (
                <tr key={c.id} className="border-t">
                  <td data-label="Empresa" className="p-3 font-semibold">
                    {c.name}
                    <div className="text-xs text-muted-foreground">{c.legal_name}</div>
                    {c.public_code && (
                      <ClientQrCard clientName={c.name} publicCode={c.public_code} />
                    )}
                  </td>
                  <td data-label="CNPJ" className="p-3">
                    {c.cnpj ?? "—"}
                  </td>
                  <td data-label="Cidade/UF" className="p-3">
                    {c.city}/{c.state}
                  </td>
                  <td data-label="Status" className="p-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td data-label="Etiquetas" className="p-3">
                    {s?.labels ?? 0}
                  </td>
                  <td data-label="Ações" className="master-row-actions p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => edit(c)}>
                      Editar
                    </Button>
                    {c.status !== "suspensa" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          await setClientStatus({ data: { clientId: c.id, status: "suspensa" } });
                          await onChanged();
                        }}
                      >
                        Suspender
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await setClientStatus({ data: { clientId: c.id, status: "ativa" } });
                          await onChanged();
                        }}
                      >
                        Reativar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  Nenhuma empresa cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ClientRow["status"] }) {
  const map = {
    ativa: "bg-emerald-100 text-emerald-700",
    inativa: "bg-zinc-200 text-zinc-700",
    suspensa: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function UsuariosTab({
  clients,
  users,
  onChanged,
}: {
  clients: ClientRow[];
  users: UserRow[];
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "operator" as "admin_master" | "nutricionista" | "admin_cliente" | "gerente" | "operator",
    clientId: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const needsClient =
    form.role === "operator" || form.role === "admin_cliente" || form.role === "gerente";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await createUser({
        data: {
          name: form.name,
          email: form.email,
          role: form.role,
          clientId: needsClient ? form.clientId : null,
          password: form.password || undefined,
        },
      });
      setForm({ name: "", email: "", role: "operator", clientId: "", password: "" });
      setMsg("Usuário criado.");
      await onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao criar usuário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <form
        onSubmit={save}
        className="master-form grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Nome">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Perfil">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
          >
            <option value="admin_master">Admin Master TiNutri</option>
            <option value="nutricionista">Nutricionista</option>
            <option value="admin_cliente">Admin Cliente</option>
            <option value="gerente">Gerente</option>
            <option value="operator">Colaborador</option>
          </select>
        </Field>
        {needsClient && (
          <Field label="Empresa vinculada">
            <select
              required
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">Selecione…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Senha inicial (opcional — sem senha enviamos convite)">
          <input
            type="text"
            minLength={0}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <div className="master-form-actions sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Criando…" : "Criar usuário"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </form>

      <div className="master-records min-w-0 rounded-2xl border bg-card">
        <table className="master-table w-full text-sm">
          <caption className="sr-only">Usuários cadastrados</caption>
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Perfil</th>
              <th className="p-3">Empresa</th>
              <th className="master-row-actions p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className="border-t">
                <td data-label="Nome" className="p-3 font-semibold">
                  {u.name}
                </td>
                <td data-label="E-mail" className="p-3">
                  {u.email}
                </td>
                <td data-label="Perfil" className="p-3">
                  {u.role ?? "—"}
                </td>
                <td data-label="Empresa" className="p-3">
                  {clients.find((c) => c.id === u.client_id)?.name ?? "—"}
                </td>
                <td data-label="Ações" className="master-row-actions p-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await resetUserPassword({ data: { userId: u.user_id } });
                      alert("Link de redefinição enviado.");
                    }}
                  >
                    Resetar senha
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CarteiraTab({
  clients,
  users,
  carteira,
  onChanged,
}: {
  clients: ClientRow[];
  users: UserRow[];
  carteira: { nutritionist_user_id: string; client_id: string }[];
  onChanged: () => Promise<void>;
}) {
  const nutris = users.filter((u) => u.role === "nutricionista");
  const [nutri, setNutri] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const grouped = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of carteira) {
      const arr = m.get(c.nutritionist_user_id) ?? [];
      arr.push(c.client_id);
      m.set(c.nutritionist_user_id, arr);
    }
    return m;
  }, [carteira]);

  return (
    <section className="space-y-4">
      <div className="master-form grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nutricionista">
          <select value={nutri} onChange={(e) => setNutri(e.target.value)}>
            <option value="">Selecione…</option>
            {nutris.map((n) => (
              <option key={n.user_id} value={n.user_id}>
                {n.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Empresa">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="master-form-actions flex items-end sm:col-span-2 lg:col-span-1">
          <Button
            disabled={!nutri || !clientId}
            onClick={async () => {
              await assignNutritionistClient({ data: { nutritionistUserId: nutri, clientId } });
              setClientId("");
              await onChanged();
            }}
          >
            Vincular
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {nutris.map((n) => (
          <div key={n.user_id} className="master-portfolio min-w-0 rounded-2xl border bg-card p-4">
            <p className="font-bold">{n.name}</p>
            <p className="text-xs text-muted-foreground">{n.email}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {(grouped.get(n.user_id) ?? []).map((cid) => {
                const c = clients.find((x) => x.id === cid);
                return (
                  <li
                    key={cid}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 break-words">{c?.name ?? cid}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await removeNutritionistClient({
                          data: { nutritionistUserId: n.user_id, clientId: cid },
                        });
                        await onChanged();
                      }}
                    >
                      Remover
                    </Button>
                  </li>
                );
              })}
              {!(grouped.get(n.user_id) ?? []).length && (
                <li className="text-xs text-muted-foreground">Sem clientes na carteira.</li>
              )}
            </ul>
          </div>
        ))}
        {nutris.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Cadastre uma nutricionista na aba Usuários para começar.
          </p>
        )}
      </div>
    </section>
  );
}

function AtividadesTab({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="master-records min-w-0 rounded-2xl border bg-card">
      <table className="master-table w-full text-sm">
        <caption className="sr-only">Últimas atividades</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-3">Data/Hora</th>
            <th className="p-3">Usuário</th>
            <th className="p-3">Ação</th>
            <th className="p-3">Entidade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td data-label="Data/Hora" className="p-3 whitespace-nowrap">
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </td>
              <td data-label="Usuário" className="p-3">
                {r.user_name ?? "—"}
              </td>
              <td data-label="Ação" className="p-3 font-mono text-xs">
                {r.action}
              </td>
              <td data-label="Entidade" className="p-3 text-xs text-muted-foreground">
                {r.entity_type ?? "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-3 text-muted-foreground">
                Nenhuma atividade registrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="min-w-0 text-xs font-semibold text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <div className="mt-1 [&_input]:w-full [&_select]:w-full [&_input]:rounded-md [&_select]:rounded-md [&_input]:border [&_select]:border [&_input]:bg-background [&_select]:bg-background [&_input]:px-3 [&_select]:px-3 [&_input]:py-2 [&_select]:py-2 [&_input]:text-sm [&_select]:text-sm [&_input]:text-foreground [&_select]:text-foreground">
        {cloneElement(children, { id })}
      </div>
    </div>
  );
}
