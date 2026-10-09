import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  BriefcaseBusiness,
  ClipboardList,
  History,
  LogOut,
  Menu,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageLoading } from "@/components/PaginationControls";
import { supabase } from "@/integrations/supabase/client";
import { ClientsPanel } from "@/components/ClientsPanel";
import { AuditActionDetails } from "@/components/AuditActionDetails";
import { OverviewPanel } from "@/components/master/OverviewPanel";
import { UsersPanel } from "@/components/master/UsersPanel";
import { PortfolioPanel } from "@/components/master/PortfolioPanel";
import { CarePanel } from "@/components/master/CarePanel";
import { ActivitiesPanel } from "@/components/master/ActivitiesPanel";
import { CompanyModal } from "@/components/master/CompanyModal";
import { ReportModal } from "@/components/master/ReportModal";
import type { Company } from "@/lib/management";
import type { RecentAction } from "@/lib/dashboard";
import logo from "@/assets/tinutri-logo.png";
export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Área Master · TiNutri Smart Label®" }] }),
  component: AdminMaster,
});
const sections = [
  { id: "visao", name: "Visão geral", icon: LayoutDashboard },
  { id: "empresas", name: "Empresas", icon: Building2 },
  { id: "usuarios", name: "Usuários", icon: Users },
  { id: "carteira", name: "Carteira", icon: BriefcaseBusiness },
  { id: "acompanhamento", name: "Acompanhamento", icon: ClipboardList },
  { id: "atividades", name: "Atividades", icon: History },
] as const;
type Section = (typeof sections)[number]["id"];
function AdminMaster() {
  const [gate, setGate] = useState<"loading" | "authorized" | "denied" | "error">("loading");
  const [user, setUser] = useState({ id: "", name: "" });
  const [tab, setTab] = useState<Section>("visao");
  const [revision, setRevision] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [report, setReport] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [context, setContext] = useState("");
  const [companyFilter, setCompanyFilter] = useState<
    "all" | "ativa" | "sem_responsavel" | "suspensa"
  >("all");
  const [focusedCompany, setFocusedCompany] = useState<string | null>(null);
  const [focusedUser, setFocusedUser] = useState<string | null>(null);
  const [focusedCare, setFocusedCare] = useState<string | null>(null);
  const [careFilter, setCareFilter] = useState("all");
  const [audit, setAudit] = useState<RecentAction | null>(null);
  const [warning, setWarning] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      if (alive) setGate("error");
    }, 20000);
    setGate("loading");
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (controller.signal.aborted) throw new Error("Timeout");
        if (error && error.name !== "AuthSessionMissingError") throw error;
        if (!data.user) {
          if (alive) setGate("denied");
          return;
        }
        const [role, profile] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.user.id)
            .abortSignal(controller.signal)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("name")
            .eq("user_id", data.user.id)
            .abortSignal(controller.signal)
            .maybeSingle(),
        ]);
        if (role.error || profile.error || controller.signal.aborted)
          throw role.error ?? profile.error ?? new Error("Timeout");
        if (!alive) return;
        setUser({
          id: data.user.id,
          name: profile.data?.name ?? data.user.email ?? "Administrador",
        });
        setGate(
          ["admin", "admin_master"].includes(String(role.data?.role)) ? "authorized" : "denied",
        );
      } catch {
        if (alive) setGate("error");
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [retry]);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const focusHandled = useCallback(() => setFocusedCompany(null), []);
  const activity = useCallback(
    async (
      action: string,
      client: string | null,
      entity: string,
      id: string,
      name: string,
      before: Record<string, unknown>,
      after: Record<string, unknown>,
    ) => {
      try {
        const { error } = await supabase.from("activity_logs").insert({
          user_id: user.id,
          user_name: user.name,
          client_id: client,
          action,
          entity_type: entity,
          entity_id: id,
          metadata: { name, before, after } as never,
        });
        if (error) throw error;
      } catch {
        setWarning("A alteração foi salva, mas não foi possível registrar esta ação no histórico.");
      }
    },
    [user.id, user.name],
  );
  const inspect = useCallback((record: Company) => setCompany(record), []);
  const openCompany = async (id: string) => {
    const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
    if (error || !data) setWarning("Não foi possível abrir a empresa.");
    else setCompany(data);
  };
  const navigate = (id: Section) => {
    setTab(id);
    setContext("");
    setDrawer(false);
    setFocusedCare(null);
    setFocusedUser(null);
  };
  const exit = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.assign("/");
    } catch {
      setWarning("Não foi possível encerrar a sessão. Tente novamente.");
      setLogoutBusy(false);
    }
  };
  const menu = (
    <nav aria-label="Seções da Área Master" className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      {sections.map((item) => (
        <Button
          key={item.id}
          variant="ghost"
          aria-current={tab === item.id ? "page" : undefined}
          className="workspace-nav-item h-11 w-full justify-start"
          onClick={() => navigate(item.id)}
        >
          <item.icon />
          {item.name}
        </Button>
      ))}
    </nav>
  );
  const actions = (
    <div className="workspace-sidebar-actions mt-5 space-y-2 border-t pt-4">
      <Button asChild variant="ghost" className="workspace-nav-item h-11 w-full justify-start">
        <Link to="/">
          <ArrowLeft />
          Voltar ao app
        </Link>
      </Button>
      <Button
        variant="ghost"
        disabled={logoutBusy}
        className="workspace-nav-item h-11 w-full justify-start"
        onClick={() => void exit()}
      >
        <LogOut />
        {logoutBusy ? "Saindo…" : "Sair"}
      </Button>
    </div>
  );
  if (gate !== "authorized")
    return (
      <main className="grid min-h-[80svh] place-items-center p-5">
        <section className="w-full max-w-md rounded-2xl border bg-card p-6">
          {gate === "loading" ? (
            <p role="status">Verificando acesso à Área Master…</p>
          ) : gate === "error" ? (
            <PageLoading
              error="Não foi possível verificar seu acesso."
              retry={() => setRetry((value) => value + 1)}
            />
          ) : (
            <>
              <h1 className="text-xl font-semibold">Acesso restrito</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Esta área é destinada à administração TiNutri. O acompanhamento da nutricionista
                está disponível no app, conforme sua carteira.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/">Voltar ao app</Link>
              </Button>
            </>
          )}
        </section>
      </main>
    );
  return (
    <div className="workspace-shell master-workspace min-h-screen bg-background">
      <header className="workspace-header sticky top-0 z-30 border-b px-4 sm:px-6">
        <div className="workspace-topbar flex items-center gap-3">
          <div className="lg:hidden">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu master">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[86%] max-w-xs flex-col">
                <SheetHeader className="mb-5 border-b pb-5 text-left">
                  <SheetTitle>Gestão TiNutri</SheetTitle>
                </SheetHeader>
                {menu}
                {actions}
              </SheetContent>
            </Sheet>
          </div>
          <img src={logo} alt="TiNutri" className="h-9 w-auto" />
          <span className="text-sm font-semibold">Área Master</span>
          <div className="workspace-user ml-auto flex min-w-0 items-center gap-2">
            <span className="workspace-avatar shrink-0">{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="text-[10px] text-muted-foreground">Admin Master</p>
            </div>
          </div>
        </div>
      </header>
      <div className="workspace-layout flex">
        <aside className="workspace-sidebar hidden w-60 shrink-0 lg:block">
          <div className="workspace-sidebar-content flex flex-col">
            <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
              Gestão e acompanhamento
            </p>
            {menu}
            {actions}
          </div>
        </aside>
        <main className="workspace-main min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>TiNutri · {sections.find((item) => item.id === tab)?.name}</p>
            <Button variant="ghost" className="text-xs" onClick={changed}>
              <RefreshCw />
              Atualizar
            </Button>
          </div>
          {warning && (
            <p role="alert" className="clients-error mb-5">
              {warning}
            </p>
          )}
          {tab === "visao" && (
            <OverviewPanel
              revision={revision}
              onAction={setAudit}
              onCompanies={(filter) => {
                setCompanyFilter(filter);
                setTab("empresas");
              }}
              onCare={(filter) => {
                setCareFilter(filter);
                setContext("");
                setTab("acompanhamento");
              }}
              onUsers={() => navigate("usuarios")}
              onReport={() => setReport(true)}
              onExpiry={(value) => window.location.assign(`/?painel=validades&janela=${value}`)}
            />
          )}{" "}
          {tab === "empresas" && (
            <ClientsPanel
              master
              initialFilter={companyFilter}
              scope={null}
              revision={revision}
              refresh={async () => changed()}
              focusedId={focusedCompany}
              onFocusHandled={focusHandled}
              onInspect={inspect}
              recordActivity={activity}
            />
          )}{" "}
          {tab === "usuarios" && (
            <UsersPanel
              focusedId={focusedUser}
              key={context}
              initialClient={context}
              revision={revision}
              onChanged={changed}
              onActivity={activity}
            />
          )}{" "}
          {tab === "carteira" && (
            <PortfolioPanel
              revision={revision}
              onChanged={changed}
              onActivity={activity}
              onCompany={(id) => void openCompany(id)}
            />
          )}{" "}
          {tab === "acompanhamento" && (
            <CarePanel
              key={context}
              initialClient={context}
              initialFilter={careFilter}
              scope={null}
              revision={revision}
              focusedId={focusedCare}
            />
          )}{" "}
          {tab === "atividades" && (
            <ActivitiesPanel
              key={context}
              initialClient={context}
              revision={revision}
              onAction={setAudit}
            />
          )}
        </main>
      </div>
      <ReportModal open={report} onClose={() => setReport(false)} />
      {company && (
        <CompanyModal
          key={company.id}
          company={company}
          revision={revision}
          onClose={() => setCompany(null)}
          onChanged={changed}
          onActivity={activity}
          onEdit={() => {
            setFocusedCompany(company.id);
            setCompanyFilter("all");
            setTab("empresas");
            setCompany(null);
          }}
          onSection={(section) => {
            setContext(company.id);
            setTab(section);
            setCompany(null);
          }}
        />
      )}
      <AuditActionDetails
        action={audit}
        onClose={() => setAudit(null)}
        onOpenEntity={
          audit?.entity_id &&
          ["client", "care", "product", "collaborator", "user"].includes(audit.entity_type ?? "")
            ? () => {
                const current = audit;
                setAudit(null);
                if (current.entity_type === "client") void openCompany(current.entity_id!);
                else if (current.entity_type === "user") {
                  setFocusedUser(current.entity_id!);
                  setTab("usuarios");
                } else if (current.entity_type === "care") {
                  setContext(current.client_id);
                  setFocusedCare(current.entity_id!);
                  setTab("acompanhamento");
                } else
                  window.location.assign(
                    `/?empresa=${current.client_id}&painel=${current.entity_type === "product" ? "products" : "team"}&registro=${current.entity_id}`,
                  );
              }
            : undefined
        }
      />
    </div>
  );
}
