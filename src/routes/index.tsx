import { createFileRoute } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Clock3, History, LayoutDashboard, LogOut, Menu, PackagePlus, Printer, ShieldCheck, Tag, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { claimFirstAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TiNutri Smart Label® | Emitir Etiqueta" },
      { name: "description", content: "Emita etiquetas térmicas padronizadas de identificação e validade de alimentos." },
      { property: "og:title", content: "TiNutri Smart Label®" },
      { property: "og:description", content: "Identificação e validade de alimentos em poucos toques." },
    ],
  }),
  component: Index,
});

type Client = { id: string; name: string };
type Product = { id: string; client_id: string; name: string; category: string; shelf_life_days: number; requires_lot: boolean; requires_inspection: boolean; inspection_type: "SIF" | "SISP" | "SIM" | null; inspection_number: string | null; notes: string | null };
type Collaborator = { id: string; client_id: string; name: string; email: string | null };
type LabelRecord = { id: string; client_name: string; product_name: string; responsible_name: string; lot_number: string | null; opened_on: string; issued_at: string; expires_on: string };
type AppTab = "dashboard" | "clients" | "products" | "team" | "emit" | "history";

function Index() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "operator" | null>(null);
  const [profileClientId, setProfileClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [history, setHistory] = useState<LabelRecord[]>([]);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [message, setMessage] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedResponsible, setSelectedResponsible] = useState("");
  const [openedOn, setOpenedOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [lot, setLot] = useState("");
  const [label, setLabel] = useState<{ product: string; opened: string; expires: string; lot?: string; inspection?: string; responsible: string; issued: Date } | null>(null);

  const refresh = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUserId(id);
    if (!id) { setLoading(false); return; }
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
      supabase.from("profiles").select("client_id").eq("user_id", id).maybeSingle(),
    ]);
    const currentRole = roles?.role as "admin" | "operator" | undefined;
    setRole(currentRole ?? null);
    if (currentRole === "operator") setTab("emit");
    const ownClient = profile?.client_id ?? null;
    setProfileClientId(ownClient);
    const [{ data: clientRows }, { data: productRows }, { data: collaboratorRows }] = await Promise.all([
      supabase.from("clients").select("id,name").eq("active", true).order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("collaborators").select("id,client_id,name,email").eq("active", true).order("name"),
    ]);
    setClients((clientRows ?? []) as Client[]);
    setProducts((productRows ?? []) as Product[]);
    setCollaborators((collaboratorRows ?? []) as Collaborator[]);
    if (ownClient) setSelectedClient(ownClient);
    if (currentRole === "admin") {
      const { data: labels } = await supabase.from("issued_labels").select("id,client_name,product_name,responsible_name,lot_number,opened_on,issued_at,expires_on").order("issued_at", { ascending: false }).limit(100);
      setHistory((labels ?? []) as LabelRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const visibleProducts = products.filter((item) => item.client_id === selectedClient);
  const visibleCollaborators = collaborators.filter((item) => item.client_id === selectedClient);
  const product = products.find((item) => item.id === selectedProduct);
  const responsible = collaborators.find((item) => item.id === selectedResponsible);
  const client = clients.find((item) => item.id === selectedClient);
  const expiresOn = useMemo(() => product && openedOn ? format(addDays(new Date(`${openedOn}T12:00:00`), product.shelf_life_days), "dd/MM/yyyy") : "—", [product, openedOn]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-background"><p className="font-semibold text-muted-foreground">Preparando sua estação…</p></main>;

  if (!userId) return <Login />;

  if (!role) return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl">
        <Brand />
        <h1 className="mt-8 text-2xl font-bold">Configuração inicial</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Se este é o primeiro acesso, ative esta conta como administradora TiNutri.</p>
        <Button size="xl" className="mt-6 w-full" onClick={async () => { try { await claimFirstAdmin(); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível ativar."); } }}>Ativar administrador</Button>
        {message && <p role="alert" className="mt-4 text-sm text-destructive">{message}</p>}
      </section>
    </main>
  );

  const issueLabel = async () => {
    setMessage("");
    if (!client || !product || !responsible) { setMessage("Selecione cliente, produto e responsável."); return; }
    if (product.requires_lot && !lot.trim()) { setMessage("Este produto exige número de lote."); return; }
    const issued = new Date();
    const expiry = format(addDays(new Date(`${openedOn}T12:00:00`), product.shelf_life_days), "yyyy-MM-dd");
    const inspection = product.requires_inspection ? `${product.inspection_type}: ${product.inspection_number}` : undefined;
    const { error } = await supabase.from("issued_labels").insert({
      client_id: client.id, product_id: product.id, responsible_id: responsible.id, issued_by: userId,
      client_name: client.name, product_name: product.name, responsible_name: responsible.name,
      lot_number: lot.trim() || null, inspection_label: inspection ?? null, opened_on: openedOn, expires_on: expiry,
    });
    if (error) { setMessage("Não foi possível registrar a etiqueta. Verifique seu acesso."); return; }
    setLabel({ product: product.name, opened: format(new Date(`${openedOn}T12:00:00`), "dd/MM/yyyy"), expires: format(new Date(`${expiry}T12:00:00`), "dd/MM/yyyy"), lot: lot.trim() || undefined, inspection, responsible: responsible.name, issued });
    setTimeout(() => window.print(), 120);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 px-4 py-3 backdrop-blur sm:px-7">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menu"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="w-[86%] max-w-xs p-5">
                <SheetHeader className="border-b pb-5 text-left"><SheetTitle><Brand /></SheetTitle></SheetHeader>
                <nav className="mt-6 space-y-2"><Nav role={role} tab={tab} setTab={setTab} closeOnSelect /></nav>
              </SheetContent>
            </Sheet>
          </div>
          <Brand />
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={async () => { await supabase.auth.signOut(); location.reload(); }}><LogOut /></Button>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-7 lg:py-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <p className="mb-3 px-3 text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Menu principal</p>
          <nav className="space-y-2">
          <Nav role={role} tab={tab} setTab={setTab} />
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          {tab === "dashboard" && <DashboardPanel clients={clients} products={products} collaborators={collaborators} history={history} setTab={setTab} />}
          {tab === "emit" && <section>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Estação de etiquetagem</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Emitir nova etiqueta</h1>
            <p className="mt-2 text-muted-foreground">Selecione, confira e imprima. A validade é calculada automaticamente.</p>
            <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
                <Field label="Cliente"><select value={selectedClient} disabled={role === "operator"} onChange={(e) => { setSelectedClient(e.target.value); setSelectedProduct(""); setSelectedResponsible(""); }}><option value="">Selecione o cliente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Produto"><select value={selectedProduct} onChange={(e) => { setSelectedProduct(e.target.value); setLot(""); }}><option value="">Selecione o produto</option>{visibleProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Data de abertura"><input type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} /></Field>
                  <div className="rounded-2xl bg-secondary p-4"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Validade calculada</span><strong className="mt-1 block text-xl text-primary">{expiresOn}</strong></div>
                </div>
                {product?.requires_lot && <Field label="Número do lote" hint="Obrigatório para este produto"><input value={lot} maxLength={80} onChange={(e) => setLot(e.target.value)} placeholder="Ex.: 4587" /></Field>}
                {product?.requires_inspection && <div className="rounded-2xl border border-primary/20 bg-secondary p-4 text-sm"><ShieldCheck className="mr-2 inline size-5 text-primary" /><strong>{product.inspection_type}/registro:</strong> {product.inspection_number}</div>}
                <Field label="Responsável"><select value={selectedResponsible} onChange={(e) => setSelectedResponsible(e.target.value)}><option value="">Selecione o responsável</option>{visibleCollaborators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                {message && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{message}</p>}
                <Button variant="kitchen" size="xl" className="w-full" onClick={issueLabel}><Printer /> Emitir etiqueta</Button>
              </div>
              <div><p className="mb-3 text-sm font-bold text-muted-foreground">PRÉ-VISUALIZAÇÃO · 60 × 40 MM</p><ThermalLabel label={label ?? { product: product?.name ?? "PRODUTO", opened: openedOn ? format(new Date(`${openedOn}T12:00:00`), "dd/MM/yyyy") : "—", expires: expiresOn, lot: lot || undefined, inspection: product?.requires_inspection ? `${product.inspection_type}: ${product.inspection_number}` : undefined, responsible: responsible?.name ?? "RESPONSÁVEL", issued: new Date() }} /></div>
            </div>
          </section>}
          {tab === "clients" && <ClientsPanel clients={clients} refresh={refresh} />}
          {tab === "products" && <ProductsPanel clients={clients} products={products} refresh={refresh} />}
          {tab === "team" && <TeamPanel clients={clients} collaborators={collaborators} refresh={refresh} />}
          {tab === "history" && <HistoryPanel history={history} />}
        </main>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  return <main className="grid min-h-screen bg-primary lg:grid-cols-2"><section className="hidden flex-col justify-between p-12 text-primary-foreground lg:flex"><Brand inverse /><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground/70">Segurança dos alimentos</p><h1 className="mt-4 max-w-xl text-5xl font-bold leading-tight">Identificação correta, em poucos segundos.</h1><p className="mt-5 max-w-md text-lg text-primary-foreground/75">Etiquetas padronizadas para uma operação mais segura, ágil e confiável.</p></div><p className="text-sm text-primary-foreground/60">TiNutri Consultoria · RDC 216 e CVS-5</p></section><section className="grid place-items-center bg-background p-5"><div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-2xl sm:p-9"><div className="lg:hidden"><Brand /></div><h2 className="mt-8 text-3xl font-bold">Acesse sua estação</h2><p className="mt-2 text-sm text-muted-foreground">Use o acesso fornecido pela TiNutri.</p><form className="mt-7 space-y-4" onSubmit={async (event) => { event.preventDefault(); setError(""); const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) setError("E-mail ou senha inválidos."); else location.reload(); }}><Field label="E-mail"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field><Field label="Senha"><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button size="xl" className="w-full" type="submit">Entrar</Button></form><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OU<span className="h-px flex-1 bg-border" /></div><Button variant="outline" size="xl" className="w-full" onClick={async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) setError("Não foi possível entrar com Google."); }}>Continuar com Google</Button></div></section></main>;
}

function Brand({ inverse = false }: { inverse?: boolean }) { return <div className="flex min-w-0 items-center gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${inverse ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}><Tag className="size-5" /></div><div className="min-w-0"><strong className={`block truncate font-display text-lg leading-tight ${inverse ? "text-primary-foreground" : "text-foreground"}`}>TiNutri Smart Label®</strong><span className={`text-xs ${inverse ? "text-primary-foreground/65" : "text-muted-foreground"}`}>Validade simples. Segurança sempre.</span></div></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 flex justify-between text-sm font-bold">{label}{hint && <small className="font-medium text-muted-foreground">{hint}</small>}</span>{children}</label> }
function ThermalLabel({ label }: { label: { product: string; opened: string; expires: string; lot?: string; inspection?: string; responsible: string; issued: Date } }) { const rows = [["PRODUTO", label.product], ["ABERTO EM", label.opened], ["VALIDADE", label.expires], ...(label.lot ? [["LOTE", label.lot]] : []), ...(label.inspection ? [["SIF/SISP/SIM", label.inspection.replace(/^\w+:\s*/, "")]] : []), ["RESPONSÁVEL", label.responsible], ["EMITIDO EM", format(label.issued, "dd/MM/yyyy")], ["HORÁRIO", format(label.issued, "HH:mm")]]; return <div className="thermal-label aspect-[3/2] w-full overflow-hidden border-2 border-foreground bg-card p-[4%] font-sans text-foreground shadow-xl"><div className="mb-[2%] flex items-center gap-2 border-b-2 border-foreground pb-[2%]"><Tag className="size-[5%] min-h-3 min-w-3" /><strong className="text-[clamp(10px,3.2vw,15px)] leading-none">TiNutri Smart Label®</strong></div><div className="space-y-[0.5%]">{rows.map(([key, value]) => <p key={key} className="truncate text-[clamp(8px,2.65vw,12px)] font-semibold leading-[1.22]"><strong>{key}:</strong> {value.toUpperCase()}</p>)}</div></div> }

const navItems = [{ id: "emit", label: "Emitir etiqueta", icon: Printer }, { id: "clients", label: "Clientes", icon: Building2 }, { id: "products", label: "Produtos", icon: PackagePlus }, { id: "team", label: "Colaboradores", icon: Users }, { id: "history", label: "Histórico", icon: History }, { id: "settings", label: "Layout", icon: Settings2 }] as const;
function Nav({ role, tab, setTab }: { role: string; tab: string; setTab: (id: any) => void }) { return navItems.filter((item) => role === "admin" || item.id === "emit").map((item) => <Button key={item.id} variant={tab === item.id ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => setTab(item.id)}><item.icon />{item.label}</Button>) }
function MobileNav({ role, tab, setTab }: { role: string; tab: string; setTab: (id: any) => void }) { const items = role === "admin" ? navItems.slice(0, 5) : navItems.slice(0, 1); return items.map((item) => <button key={item.id} aria-label={item.label} className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold ${tab === item.id ? "text-primary" : "text-muted-foreground"}`} onClick={() => setTab(item.id)}><item.icon className="size-5" />{item.label.split(" ")[0]}</button>) }

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-muted-foreground">{description}</p></> }
function ClientsPanel({ clients, refresh }: { clients: Client[]; refresh: () => Promise<void> }) { const [name, setName] = useState(""); return <section><PanelHeader eyebrow="Administração" title="Clientes" description="Cada cliente possui sua própria base isolada."/><form className="mt-7 flex gap-3 rounded-2xl border bg-card p-4" onSubmit={async (e) => { e.preventDefault(); if (name.trim().length < 2) return; await supabase.from("clients").insert({ name: name.trim() }); setName(""); await refresh(); }}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Nome do novo cliente"/><Button type="submit" className="h-auto">Cadastrar</Button></form><div className="mt-5 grid gap-3 sm:grid-cols-2">{clients.map((c) => <article key={c.id} className="rounded-2xl border bg-card p-5"><Building2 className="text-primary"/><strong className="mt-3 block">{c.name}</strong></article>)}</div></section> }
// The form narrows this enum at submission through the rendered select options.
// @ts-expect-error Supabase's generated enum type cannot infer the controlled select's values.
function ProductsPanel({ clients, products, refresh }: { clients: Client[]; products: Product[]; refresh: () => Promise<void> }) { const [form, setForm] = useState({ client_id: "", name: "", category: "", shelf_life_days: "3", requires_lot: false, requires_inspection: false, inspection_type: "SIF", inspection_number: "", notes: "" }); const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value })); return <section><PanelHeader eyebrow="Catálogo por cliente" title="Produtos" description="Cadastre as regras que serão aplicadas automaticamente."/><form className="mt-7 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await supabase.from("products").insert({ ...form, shelf_life_days: Number(form.shelf_life_days), inspection_type: form.requires_inspection ? form.inspection_type : null, inspection_number: form.requires_inspection ? form.inspection_number : null, notes: form.notes || null }); setForm({ ...form, name: "", notes: "", inspection_number: "" }); await refresh(); }}><Field label="Cliente"><select required value={form.client_id} onChange={(e) => update("client_id", e.target.value)}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Produto"><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => update("name", e.target.value)}/></Field><Field label="Categoria"><input required minLength={2} maxLength={80} value={form.category} onChange={(e) => update("category", e.target.value)}/></Field><Field label="Validade após aberto (dias)"><input required type="number" min="0" max="3650" value={form.shelf_life_days} onChange={(e) => update("shelf_life_days", e.target.value)}/></Field><label className="flex items-center gap-3 font-semibold"><input className="size-5 w-auto" type="checkbox" checked={form.requires_lot} onChange={(e) => update("requires_lot", e.target.checked)}/> Exige lote</label><label className="flex items-center gap-3 font-semibold"><input className="size-5 w-auto" type="checkbox" checked={form.requires_inspection} onChange={(e) => update("requires_inspection", e.target.checked)}/> Exige SIF/SISP/SIM</label>{form.requires_inspection && <><Field label="Tipo"><select value={form.inspection_type} onChange={(e) => update("inspection_type", e.target.value)}><option>SIF</option><option>SISP</option><option>SIM</option></select></Field><Field label="Número"><input required maxLength={40} value={form.inspection_number} onChange={(e) => update("inspection_number", e.target.value)}/></Field></>}<div className="sm:col-span-2"><Button type="submit">Cadastrar produto</Button></div></form><div className="mt-5 divide-y rounded-2xl border bg-card">{products.map((p) => <div key={p.id} className="grid grid-cols-[1fr_auto] gap-3 p-4"><div><strong>{p.name}</strong><p className="text-sm text-muted-foreground">{p.category} · {p.shelf_life_days} dias</p></div><Button variant="ghost" size="sm" onClick={async () => { await supabase.from("products").update({ active: false }).eq("id", p.id); await refresh(); }}>Excluir</Button></div>)}</div></section> }
function TeamPanel({ clients, collaborators, refresh }: { clients: Client[]; collaborators: Collaborator[]; refresh: () => Promise<void> }) { const [clientId, setClientId] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [msg, setMsg] = useState(""); return <section><PanelHeader eyebrow="Acessos" title="Colaboradores" description="Convide operadores e vincule cada um ao cliente correto."/><form className="mt-7 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); try { await inviteOperator({ data: { clientId, name, email } }); setMsg("Convite enviado com sucesso."); setName(""); setEmail(""); await refresh(); } catch (error) { setMsg(error instanceof Error ? error.message : "Não foi possível convidar."); } }}><Field label="Cliente"><select required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Nome"><input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)}/></Field><Field label="E-mail"><input required type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)}/></Field><div className="sm:col-span-3"><Button type="submit">Enviar convite</Button>{msg && <span className="ml-3 text-sm text-muted-foreground">{msg}</span>}</div></form><div className="mt-5 grid gap-3 sm:grid-cols-2">{collaborators.map((c) => <article key={c.id} className="rounded-2xl border bg-card p-5"><Users className="text-primary"/><strong className="mt-3 block">{c.name}</strong><p className="text-sm text-muted-foreground">{c.email}</p></article>)}</div></section> }
function HistoryPanel({ history }: { history: LabelRecord[] }) { return <section><PanelHeader eyebrow="Rastreabilidade" title="Etiquetas emitidas" description="Últimas 100 emissões registradas."/><div className="mt-7 overflow-hidden rounded-2xl border bg-card">{history.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhuma etiqueta emitida ainda.</p> : history.map((h) => <div key={h.id} className="grid gap-2 border-b p-4 sm:grid-cols-[1fr_1fr_auto]"><div><strong>{h.product_name}</strong><p className="text-sm text-muted-foreground">{h.client_name}</p></div><div><span className="text-sm">{h.responsible_name}</span><p className="text-xs text-muted-foreground">Validade {format(new Date(`${h.expires_on}T12:00:00`), "dd/MM/yyyy")}</p></div><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3"/>{format(new Date(h.issued_at), "dd/MM HH:mm", { locale: ptBR })}</span></div>)}</div></section> }
function SettingsPanel({ clients }: { clients: Client[] }) { const [clientId, setClientId] = useState(""); return <section><PanelHeader eyebrow="Impressão" title="Layout da etiqueta" description="A primeira versão usa o padrão térmico 60 × 40 mm."/><div className="mt-7 max-w-xl rounded-2xl border bg-card p-6"><Field label="Cliente"><select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-secondary p-4"><span className="text-xs text-muted-foreground">Largura</span><strong className="block text-xl">60 mm</strong></div><div className="rounded-xl bg-secondary p-4"><span className="text-xs text-muted-foreground">Altura</span><strong className="block text-xl">40 mm</strong></div></div><p className="mt-5 text-sm leading-6 text-muted-foreground">O logo, os campos obrigatórios e a hierarquia visual já estão otimizados para impressoras térmicas. Configurações avançadas serão adicionadas futuramente.</p></div></section> }
