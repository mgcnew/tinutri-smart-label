import { createFileRoute } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Clock3, Copy, History, LayoutDashboard, LogOut, Menu, PackagePlus, Pencil, Printer, Search, ShieldCheck, Tag, Trash2, Users, X } from "lucide-react";
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

type Client = { id: string; name: string; legal_name: string | null; cnpj: string | null; city: string; state: string; active: boolean };
type Product = { id: string; client_id: string; name: string; category: string; shelf_life_days: number; requires_lot: boolean; requires_inspection: boolean; inspection_type: "SIF" | "SISP" | "SIM" | null; inspection_number: string | null; notes: string | null };
type Collaborator = { id: string; client_id: string; name: string; email: string | null };
type PrintableLabel = { product: string; opened: string; expires: string; lot?: string; inspection?: string; responsible: string; issued: Date };
type LabelRecord = { id: string; client_id: string; product_id: string | null; responsible_id: string | null; client_name: string; product_name: string; responsible_name: string; lot_number: string | null; inspection_label: string | null; opened_on: string; issued_at: string; expires_on: string };
type AppTab = "dashboard" | "clients" | "products" | "team" | "emit" | "history";

function reservePrintWindow() {
  return window.open("", "_blank", "popup=yes,width=520,height=380");
}

function printThermalLabel(label: PrintableLabel, printWindow = reservePrintWindow()) {
  if (!printWindow) return false;
  const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
  const lot = escapeHtml((label.lot ?? "—").toUpperCase());
  const inspection = label.inspection ? `<div class="insp">${escapeHtml(label.inspection.toUpperCase())}</div>` : "";
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiqueta TiNutri 60 × 40 mm</title><style>
    @page{size:60mm 40mm;margin:0}*{box-sizing:border-box}html,body{width:60mm;height:40mm;margin:0;padding:0;overflow:hidden;background:#fff;color:#000}body{font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:none;text-rendering:geometricPrecision}.label{width:60mm;height:40mm;padding:1.2mm 1.5mm;line-height:1;display:flex;flex-direction:column;align-items:stretch;gap:.2mm}.brand{font-size:5.5pt;font-weight:700;letter-spacing:.02em;text-align:center}.product{display:block;overflow:hidden;font-size:9pt;font-weight:800;line-height:1.1;white-space:nowrap;text-overflow:ellipsis;text-transform:uppercase;text-align:center;margin-top:.6mm}.expiry{margin-top:1mm;text-align:center}.expiry span{display:block;font-size:5pt;font-weight:700;letter-spacing:.04em}.expiry strong{display:block;font-size:20pt;font-weight:900;letter-spacing:-.03em;line-height:1;margin-top:.2mm}.fab{margin-top:.6mm}.fab span{font-size:4.5pt;font-weight:700;letter-spacing:.04em}.fab strong{font-size:8.5pt;font-weight:700}.lot{margin-top:.5mm;font-size:6.5pt;font-weight:700;text-transform:uppercase}.insp{font-size:5.5pt;font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.3mm}.footer{display:flex;align-items:baseline;justify-content:space-between;gap:1mm;margin-top:auto}.footer .resp{flex:1;min-width:0;text-align:left;line-height:1}.footer .resp span{display:block;font-size:4.5pt;font-weight:700;letter-spacing:.04em}.footer .resp strong{display:block;overflow:hidden;margin-top:.2mm;font-size:7.5pt;font-weight:800;white-space:nowrap;text-overflow:ellipsis;text-transform:uppercase}.footer time{flex-shrink:0;font-size:8.5pt;font-weight:700;font-variant-numeric:tabular-nums}@media print{html,body,.label{width:60mm!important;height:40mm!important}.label{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main class="label"><header class="brand">TiNutri Smart Label®</header><strong class="product">${escapeHtml(label.product.toUpperCase())}</strong><div class="expiry"><span>VALIDADE</span><strong>${escapeHtml(label.expires)}</strong></div><div class="fab"><span>FAB:</span><strong>${escapeHtml(label.opened)}</strong></div><div class="lot">LOTE: ${lot}</div>${inspection}<footer class="footer"><div class="resp"><span>RESPONSÁVEL:</span><strong>${escapeHtml(label.responsible.toUpperCase())}</strong></div><time>${format(label.issued, "HH:mm")}</time></footer></main><script>window.addEventListener('load',()=>{window.focus();setTimeout(()=>{window.print();setTimeout(()=>window.close(),400)},80)});<\/script></body></html>`);
  printWindow.document.close();
  return true;
}

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
  const [label, setLabel] = useState<PrintableLabel | null>(null);
  const [labelDraft, setLabelDraft] = useState<{ product: string; responsible: string; opened: string; expires: string; lot: string } | null>(null);

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
      supabase.from("clients").select("id,name,legal_name,cnpj,city,state,active").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("collaborators").select("id,client_id,name,email").eq("active", true).order("name"),
    ]);
    setClients((clientRows ?? []) as Client[]);
    setProducts((productRows ?? []) as Product[]);
    setCollaborators((collaboratorRows ?? []) as Collaborator[]);
    if (ownClient) setSelectedClient(ownClient);
    if (currentRole === "admin") {
       const { data: labels } = await supabase.from("issued_labels").select("id,client_id,product_id,responsible_id,client_name,product_name,responsible_name,lot_number,inspection_label,opened_on,issued_at,expires_on").order("issued_at", { ascending: false }).limit(100);
      setHistory((labels ?? []) as LabelRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const activeClients = useMemo(() => clients.filter(c => c.active), [clients]);
  const visibleProducts = products.filter((item) => item.client_id === selectedClient);
  const visibleCollaborators = collaborators.filter((item) => item.client_id === selectedClient);
  const product = products.find((item) => item.id === selectedProduct);
  const responsible = collaborators.find((item) => item.id === selectedResponsible);
  const client = clients.find((item) => item.id === selectedClient);
  const expiresOn = useMemo(() => product && openedOn ? format(addDays(new Date(`${openedOn}T12:00:00`), product.shelf_life_days), "dd/MM/yyyy") : "—", [product, openedOn]);
  const previewLabel: PrintableLabel = {
    product: labelDraft?.product || product?.name || "NOME DO PRODUTO",
    opened: labelDraft?.opened ? format(new Date(`${labelDraft.opened}T12:00:00`), "dd/MM/yyyy") : openedOn ? format(new Date(`${openedOn}T12:00:00`), "dd/MM/yyyy") : "—",
    expires: labelDraft?.expires ? format(new Date(`${labelDraft.expires}T12:00:00`), "dd/MM/yyyy") : expiresOn,
    lot: (labelDraft?.lot ?? lot) || undefined,
    inspection: product?.requires_inspection && product.inspection_type && product.inspection_number ? `${product.inspection_type}: ${product.inspection_number}` : undefined,
    responsible: labelDraft?.responsible || responsible?.name || "RESPONSÁVEL",
    issued: new Date(),
  };

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
    if (product.requires_lot && !(labelDraft?.lot ?? lot).trim()) { setMessage("Este produto exige número de lote."); return; }
    const issued = new Date();
    const effectiveOpened = labelDraft?.opened || openedOn;
    const expiry = labelDraft?.expires || format(addDays(new Date(`${effectiveOpened}T12:00:00`), product.shelf_life_days), "yyyy-MM-dd");
    const inspection = product.requires_inspection && product.inspection_type && product.inspection_number ? `${product.inspection_type}: ${product.inspection_number}` : undefined;
    const effectiveProduct = labelDraft?.product.trim() || product.name;
    const effectiveResponsible = labelDraft?.responsible.trim() || responsible.name;
    const effectiveLot = (labelDraft?.lot ?? lot).trim();
    const printWindow = reservePrintWindow();
    if (!printWindow) { setMessage("Permita a abertura da janela de impressão no navegador."); return; }
    printWindow.document.write("<!doctype html><title>Preparando etiqueta</title><p style='font-family:Arial,sans-serif'>Preparando etiqueta para impressão…</p>");
    const { error } = await supabase.from("issued_labels").insert({
      client_id: client.id, product_id: product.id, responsible_id: responsible.id, issued_by: userId,
      client_name: client.name, product_name: effectiveProduct, responsible_name: effectiveResponsible,
      lot_number: effectiveLot || null, inspection_label: inspection ?? null, opened_on: effectiveOpened, expires_on: expiry,
    });
    if (error) { printWindow.close(); setMessage("Não foi possível registrar a etiqueta. Verifique seu acesso."); return; }
    const issuedLabel = { product: effectiveProduct, opened: format(new Date(`${effectiveOpened}T12:00:00`), "dd/MM/yyyy"), expires: format(new Date(`${expiry}T12:00:00`), "dd/MM/yyyy"), lot: effectiveLot || undefined, inspection, responsible: effectiveResponsible, issued };
    setLabel(issuedLabel);
    printThermalLabel(issuedLabel, printWindow);
    await refresh();
  };

  const reprintLabel = (record: LabelRecord) => {
    const historicalLabel = { product: record.product_name, opened: format(new Date(`${record.opened_on}T12:00:00`), "dd/MM/yyyy"), expires: format(new Date(`${record.expires_on}T12:00:00`), "dd/MM/yyyy"), lot: record.lot_number ?? undefined, inspection: record.inspection_label ?? undefined, responsible: record.responsible_name, issued: new Date(record.issued_at) };
    setLabel(historicalLabel);
    setTab("emit");
    if (!printThermalLabel(historicalLabel)) setMessage("Permita a abertura da janela de impressão no navegador.");
  };

  const duplicateLabel = (record: LabelRecord) => {
    setSelectedClient(record.client_id);
    setSelectedProduct(record.product_id ?? "");
    setSelectedResponsible(record.responsible_id ?? "");
    setOpenedOn(record.opened_on);
    setLot(record.lot_number ?? "");
    setLabel(null);
    setLabelDraft({ product: record.product_name, responsible: record.responsible_name, opened: record.opened_on, expires: record.expires_on, lot: record.lot_number ?? "" });
    setMessage("");
    setTab("emit");
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
                <Field label="Cliente"><select value={selectedClient} disabled={role === "operator"} onChange={(e) => { setSelectedClient(e.target.value); setSelectedProduct(""); setSelectedResponsible(""); }}><option value="">Selecione o cliente</option>{activeClients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Produto"><select value={selectedProduct} onChange={(e) => { setSelectedProduct(e.target.value); setLot(""); setLabelDraft(null); }}><option value="">Selecione o produto</option>{visibleProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Data de abertura"><input type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} /></Field>
                  <div className="rounded-2xl bg-secondary p-4"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Validade calculada</span><strong className="mt-1 block text-xl text-primary">{expiresOn}</strong></div>
                </div>
                {product?.requires_lot && <Field label="Número do lote" hint="Obrigatório para este produto"><input value={lot} maxLength={80} onChange={(e) => setLot(e.target.value)} placeholder="Ex.: 4587" /></Field>}
                {product?.requires_inspection && <div className="rounded-2xl border border-primary/20 bg-secondary p-4 text-sm"><ShieldCheck className="mr-2 inline size-5 text-primary" /><strong>{product.inspection_type}/registro:</strong> {product.inspection_number}</div>}
                <Field label="Responsável"><select value={selectedResponsible} onChange={(e) => setSelectedResponsible(e.target.value)}><option value="">Selecione o responsável</option>{visibleCollaborators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                {product && responsible && !labelDraft && <Button variant="outline" className="w-full" onClick={() => setLabelDraft({ product: product.name, responsible: responsible.name, opened: openedOn, expires: format(addDays(new Date(`${openedOn}T12:00:00`), product.shelf_life_days), "yyyy-MM-dd"), lot })}><Pencil /> Editar etiqueta antes de imprimir</Button>}
                {labelDraft && <div className="grid gap-4 rounded-2xl border bg-secondary/50 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nome na etiqueta"><input maxLength={120} value={labelDraft.product} onChange={(e) => setLabelDraft({ ...labelDraft, product: e.target.value })} /></Field></div><Field label="Aberto em"><input type="date" value={labelDraft.opened} onChange={(e) => setLabelDraft({ ...labelDraft, opened: e.target.value })} /></Field><Field label="Validade"><input type="date" value={labelDraft.expires} onChange={(e) => setLabelDraft({ ...labelDraft, expires: e.target.value })} /></Field><Field label="Lote"><input maxLength={80} value={labelDraft.lot} onChange={(e) => setLabelDraft({ ...labelDraft, lot: e.target.value })} /></Field><Field label="Responsável"><input maxLength={120} value={labelDraft.responsible} onChange={(e) => setLabelDraft({ ...labelDraft, responsible: e.target.value })} /></Field><div className="sm:col-span-2"><Button variant="ghost" size="sm" onClick={() => setLabelDraft(null)}>Cancelar edição</Button></div></div>}
                {message && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{message}</p>}
                <Button variant="kitchen" size="xl" className="w-full" onClick={issueLabel}><Printer /> Emitir etiqueta</Button>
              </div>
              <div><p className="mb-3 text-sm font-bold text-muted-foreground">PRÉ-VISUALIZAÇÃO · TAMANHO REAL 50 × 30 MM</p><ThermalLabel label={label ?? previewLabel} /></div>
            </div>
          </section>}
          {tab === "clients" && <ClientsPanel clients={clients} refresh={refresh} />}
          {tab === "products" && <ProductsPanel clients={clients} products={products} refresh={refresh} />}
          {tab === "team" && <TeamPanel clients={clients} collaborators={collaborators} refresh={refresh} />}
          {tab === "history" && <HistoryPanel history={history} onReprint={reprintLabel} onDuplicate={duplicateLabel} />}
        </main>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  return <main className="grid min-h-screen bg-primary lg:grid-cols-2"><section className="hidden flex-col justify-between p-12 text-primary-foreground lg:flex"><Brand inverse /><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground/70">Segurança dos alimentos</p><h1 className="mt-4 max-w-xl text-5xl font-bold leading-tight">Identificação correta, em poucos segundos.</h1><p className="mt-5 max-w-md text-lg text-primary-foreground/75">Etiquetas padronizadas para uma operação mais segura, ágil e confiável.</p></div><p className="text-sm text-primary-foreground/60">TiNutri Consultoria · RDC 216 e CVS-5</p></section><section className="grid place-items-center bg-background p-5"><div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-2xl sm:p-9"><div className="lg:hidden"><Brand /></div><h2 className="mt-8 text-3xl font-bold">Acesse sua estação</h2><p className="mt-2 text-sm text-muted-foreground">Use o acesso fornecido pela TiNutri.</p><form className="mt-7 space-y-4" onSubmit={async (event) => { event.preventDefault(); setError(""); const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) setError("E-mail ou senha inválidos."); else location.reload(); }}><Field label="E-mail"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field><Field label="Senha"><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button size="xl" className="w-full" type="submit">Entrar</Button></form><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OU<span className="h-px flex-1 bg-border" /></div><Button variant="outline" size="xl" className="w-full" onClick={async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) setError("Não foi possível entrar com Google."); }}>Continuar com Google</Button></div></section></main>;
}

function Brand({ inverse = false }: { inverse?: boolean }) { return <div className="flex min-w-0 items-center gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${inverse ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}><Tag className="size-5" /></div><div className="min-w-0"><strong className={`block truncate font-display text-lg leading-tight ${inverse ? "text-primary-foreground" : "text-foreground"}`}>TiNutri Smart Label®</strong><span className={`text-xs ${inverse ? "text-primary-foreground/65" : "text-muted-foreground"}`}>Validade simples. Segurança sempre.</span></div></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 flex justify-between text-sm font-bold">{label}{hint && <small className="font-medium text-muted-foreground">{hint}</small>}</span>{children}</label> }
function ThermalLabel({ label }: { label: { product: string; opened: string; expires: string; lot?: string; inspection?: string; responsible: string; issued: Date } }) {
  return <div className="thermal-label !h-[30mm] !w-[50mm] min-h-[30mm] min-w-[50mm] max-h-[30mm] max-w-[50mm] shrink-0" aria-label="Pré-visualização da etiqueta térmica de 50 por 30 milímetros">
    <header className="thermal-label__brand">TiNutri Smart Label®</header>
    <strong className="thermal-label__product">{label.product.toUpperCase()}</strong>
    <div className="thermal-label__dates">
      <div className="thermal-label__expiry"><span>VALIDADE</span><strong>{label.expires}</strong></div>
      <div className="thermal-label__opened"><span>ABERTO EM</span><strong>{label.opened}</strong></div>
    </div>
    <div className="thermal-label__meta">
      <strong>LOTE: {(label.lot ?? "—").toUpperCase()}</strong>
      {label.inspection && <span>{label.inspection}</span>}
    </div>
    <footer className="thermal-label__footer">
      <div><span>RESPONSÁVEL</span><strong>{label.responsible.toUpperCase()}</strong></div>
      <time>{format(label.issued, "HH:mm")}</time>
    </footer>
  </div>;
}

const navItems = [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "clients", label: "Clientes", icon: Building2 }, { id: "products", label: "Produtos", icon: PackagePlus }, { id: "team", label: "Colaboradores", icon: Users }, { id: "emit", label: "Emitir Etiquetas", icon: Printer }, { id: "history", label: "Histórico", icon: History }] as const;
function Nav({ role, tab, setTab, closeOnSelect = false }: { role: string; tab: AppTab; setTab: (id: AppTab) => void; closeOnSelect?: boolean }) { return navItems.filter((item) => role === "admin" || item.id === "emit").map((item) => { const control = <Button key={item.id} variant={tab === item.id ? "secondary" : "ghost"} className="h-11 w-full justify-start" onClick={() => setTab(item.id)}><item.icon />{item.label}</Button>; return closeOnSelect ? <SheetClose asChild key={item.id}>{control}</SheetClose> : control; }); }

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-muted-foreground">{description}</p></> }

function DashboardPanel({ clients, products, collaborators, history, setTab }: { clients: Client[]; products: Product[]; collaborators: Collaborator[]; history: LabelRecord[]; setTab: (tab: AppTab) => void }) { const summaries = [{ label: "Clientes", value: clients.filter(c => c.active).length, icon: Building2, target: "clients" as AppTab }, { label: "Produtos", value: products.length, icon: PackagePlus, target: "products" as AppTab }, { label: "Colaboradores", value: collaborators.length, icon: Users, target: "team" as AppTab }, { label: "Etiquetas emitidas", value: history.length, icon: History, target: "history" as AppTab }]; return <section><PanelHeader eyebrow="Visão geral" title="Dashboard" description="Acesso rápido à operação do TiNutri Smart Label®."/><Button variant="kitchen" size="xl" className="mt-7 w-full sm:w-auto" onClick={() => setTab("emit")}><Printer/>Emitir nova etiqueta</Button><div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{summaries.map((item) => <Button key={item.label} variant="outline" className="h-auto min-w-0 whitespace-normal rounded-2xl bg-card p-4 text-left shadow-sm" onClick={() => setTab(item.target)}><span className="w-full"><item.icon className="size-5 text-primary"/><strong className="mt-5 block text-2xl">{item.value}</strong><span className="text-xs font-semibold text-muted-foreground sm:text-sm">{item.label}</span></span></Button>)}</div><div className="mt-8"><h2 className="text-lg font-bold">Últimas emissões</h2><div className="mt-3 overflow-hidden rounded-2xl border bg-card">{history.length === 0 ? <p className="p-7 text-center text-sm text-muted-foreground">Nenhuma etiqueta emitida ainda.</p> : history.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b p-4 last:border-0"><div className="min-w-0"><strong className="block truncate">{item.product_name}</strong><p className="truncate text-sm text-muted-foreground">{item.client_name} · {item.responsible_name}</p></div><time className="shrink-0 text-xs text-muted-foreground">{format(new Date(item.issued_at), "dd/MM HH:mm")}</time></div>)}</div></div></section>; }

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

function ClientsPanel({ clients, refresh }: { clients: Client[]; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", legal_name: "", cnpj: "", city: "", state: "", active: true });
  const [message, setMessage] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.legal_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.cnpj || "").includes(search) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    c.state.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({ name: "", legal_name: "", cnpj: "", city: "", state: "", active: true });
    setEditingId(null);
    setShowForm(false);
    setMessage("");
  };

  const startEdit = (client: Client) => {
    setForm({
      name: client.name,
      legal_name: client.legal_name || "",
      cnpj: client.cnpj || "",
      city: client.city,
      state: client.state,
      active: client.active,
    });
    setEditingId(client.id);
    setShowForm(true);
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!form.name.trim() || !form.city.trim() || !form.state.trim()) {
      setMessage("Preencha o nome, cidade e estado.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      cnpj: form.cnpj.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      active: form.active,
    };
    if (editingId) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editingId);
      if (error) setMessage("Erro ao atualizar cliente.");
      else { resetForm(); await refresh(); }
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) setMessage("Erro ao cadastrar cliente.");
      else { resetForm(); await refresh(); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente inativar este cliente?")) return;
    await supabase.from("clients").update({ active: false }).eq("id", id);
    await refresh();
  };

  return (
    <section>
      <PanelHeader eyebrow="Administração" title="Clientes" description="Cadastre e gerencie os clientes da consultoria TiNutri." />
      {!showForm && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="shrink-0"><Building2 /> Novo Cliente</Button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, CNPJ, cidade ou estado..."
              className="pl-9"
            />
          </div>
        </div>
      )}
      {showForm && (
        <form className="mt-6 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Nome do cliente"><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
          <Field label="Razão social"><input maxLength={200} value={form.legal_name} onChange={(e) => setForm(p => ({ ...p, legal_name: e.target.value }))} placeholder="Opcional" /></Field>
          <Field label="CNPJ"><input maxLength={20} value={form.cnpj} onChange={(e) => setForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="Opcional" /></Field>
          <Field label="Cidade"><input required maxLength={100} value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} /></Field>
          <Field label="Estado">
            <select required value={form.state} onChange={(e) => setForm(p => ({ ...p, state: e.target.value }))}>
              <option value="">Selecione</option>
              {BRAZILIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-3 font-semibold sm:col-span-2">
            <input className="size-5 w-auto" type="checkbox" checked={form.active} onChange={(e) => setForm(p => ({ ...p, active: e.target.checked }))} />
            Cliente ativo
          </label>
          {message && <p role="alert" className="text-sm text-destructive sm:col-span-2">{message}</p>}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar cliente"}</Button>
            <Button type="button" variant="ghost" onClick={resetForm}><X /> Cancelar</Button>
          </div>
        </form>
      )}
      <div className="mt-5 grid gap-3">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          filtered.map((c) => (
            <article key={c.id} className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong className="truncate">{c.name}</strong>
                  {!c.active && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Inativo</span>}
                </div>
                {c.legal_name && <p className="truncate text-sm text-muted-foreground">{c.legal_name}</p>}
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {c.cnpj && <span>CNPJ: {c.cnpj}</span>}
                  {c.city && <span>{c.city} · {c.state}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => startEdit(c)}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => handleDelete(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

// The form narrows this enum at submission through the rendered select options.
// @ts-expect-error Supabase's generated enum type cannot infer the controlled select's values.
function ProductsPanel({ clients, products, refresh }: { clients: Client[]; products: Product[]; refresh: () => Promise<void> }) { const [form, setForm] = useState({ client_id: "", name: "", category: "", shelf_life_days: "3", requires_lot: false, requires_inspection: false, inspection_type: "SIF", inspection_number: "", notes: "" }); const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value })); return <section><PanelHeader eyebrow="Catálogo por cliente" title="Produtos" description="Cadastre as regras que serão aplicadas automaticamente."/><form className="mt-7 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await supabase.from("products").insert({ ...form, shelf_life_days: Number(form.shelf_life_days), inspection_type: form.requires_inspection ? form.inspection_type : null, inspection_number: form.requires_inspection ? form.inspection_number : null, notes: form.notes || null }); setForm({ ...form, name: "", notes: "", inspection_number: "" }); await refresh(); }}><Field label="Cliente"><select required value={form.client_id} onChange={(e) => update("client_id", e.target.value)}><option value="">Selecione</option>{clients.filter(c => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Produto"><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => update("name", e.target.value)}/></Field><Field label="Categoria"><input required minLength={2} maxLength={80} value={form.category} onChange={(e) => update("category", e.target.value)}/></Field><Field label="Validade após aberto (dias)"><input required type="number" min="0" max="3650" value={form.shelf_life_days} onChange={(e) => update("shelf_life_days", e.target.value)}/></Field><label className="flex items-center gap-3 font-semibold"><input className="size-5 w-auto" type="checkbox" checked={form.requires_lot} onChange={(e) => update("requires_lot", e.target.checked)}/> Exige lote</label><label className="flex items-center gap-3 font-semibold"><input className="size-5 w-auto" type="checkbox" checked={form.requires_inspection} onChange={(e) => update("requires_inspection", e.target.checked)}/> Exige SIF/SISP/SIM</label>{form.requires_inspection && <><Field label="Tipo"><select value={form.inspection_type} onChange={(e) => update("inspection_type", e.target.value)}><option>SIF</option><option>SISP</option><option>SIM</option></select></Field><Field label="Número"><input required maxLength={40} value={form.inspection_number} onChange={(e) => update("inspection_number", e.target.value)}/></Field></>}<div className="sm:col-span-2"><Field label="Observações"><textarea rows={3} maxLength={500} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Informações adicionais do produto"/></Field></div><div className="sm:col-span-2"><Button type="submit" className="w-full sm:w-auto">Cadastrar produto</Button></div></form><div className="mt-5 divide-y rounded-2xl border bg-card">{products.map((p) => <div key={p.id} className="grid grid-cols-[1fr_auto] gap-3 p-4"><div><strong>{p.name}</strong><p className="text-sm text-muted-foreground">{p.category} · {p.shelf_life_days} dias</p></div><Button variant="ghost" size="sm" onClick={async () => { await supabase.from("products").update({ active: false }).eq("id", p.id); await refresh(); }}>Excluir</Button></div>)}</div></section> }

function TeamPanel({ clients, collaborators, refresh }: { clients: Client[]; collaborators: Collaborator[]; refresh: () => Promise<void> }) { const [clientId, setClientId] = useState(""); const [name, setName] = useState(""); const [msg, setMsg] = useState(""); return <section><PanelHeader eyebrow="Equipe" title="Colaboradores" description="Cadastre os responsáveis que aparecerão nas etiquetas."/><form className="mt-7 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); setMsg(""); const { error } = await supabase.from("collaborators").insert({ client_id: clientId, name: name.trim() }); if (error) { setMsg("Não foi possível cadastrar o colaborador."); return; } setName(""); setMsg("Colaborador cadastrado."); await refresh(); }}><Field label="Cliente"><select required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecione</option>{clients.filter(c => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Nome do colaborador"><input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)}/></Field><Button type="submit" className="h-12">Cadastrar</Button>{msg && <p className="text-sm text-muted-foreground sm:col-span-3">{msg}</p>}</form><div className="mt-5 grid gap-3 sm:grid-cols-2">{collaborators.map((c) => <article key={c.id} className="rounded-2xl border bg-card p-5"><Users className="text-primary"/><strong className="mt-3 block">{c.name}</strong><p className="text-sm text-muted-foreground">{clients.find((client) => client.id === c.client_id)?.name}</p></article>)}</div></section> }

function HistoryPanel({ history, onReprint, onDuplicate }: { history: LabelRecord[]; onReprint: (record: LabelRecord) => void; onDuplicate: (record: LabelRecord) => void }) {
  const [productQuery, setProductQuery] = useState("");
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const normalized = (value: string) => value.toLocaleLowerCase("pt-BR").trim();
  const filtered = history.filter((item) =>
    normalized(item.product_name).includes(normalized(productQuery)) &&
    normalized(item.responsible_name).includes(normalized(responsibleQuery)) &&
    normalized(item.client_name).includes(normalized(clientQuery)) &&
    (!dateQuery || item.issued_at.slice(0, 10) === dateQuery),
  );

  return <section><PanelHeader eyebrow="Registros" title="Etiquetas emitidas" description="Últimas 100 emissões registradas."/><div className="mt-7 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Produto"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground"/><input className="pl-9" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Pesquisar produto"/></div></Field><Field label="Responsável"><input value={responsibleQuery} onChange={(event) => setResponsibleQuery(event.target.value)} placeholder="Pesquisar responsável"/></Field><Field label="Cliente"><input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Pesquisar cliente"/></Field><Field label="Data"><input type="date" value={dateQuery} onChange={(event) => setDateQuery(event.target.value)}/></Field></div><div className="mt-4 overflow-hidden rounded-2xl border bg-card">{filtered.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhuma etiqueta encontrada.</p> : filtered.map((h) => <article key={h.id} className="grid gap-4 border-b p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center"><div><strong>{h.product_name}</strong><p className="text-sm text-muted-foreground">{h.client_name}</p></div><div className="text-sm"><p>{h.responsible_name}</p><p className="text-xs text-muted-foreground">Lote: {h.lot_number || "—"} · Aberto: {format(new Date(`${h.opened_on}T12:00:00`), "dd/MM/yyyy")}</p><p className="text-xs font-semibold text-foreground">Validade: {format(new Date(`${h.expires_on}T12:00:00`), "dd/MM/yyyy")}</p><time className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3"/>{format(new Date(h.issued_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</time></div><div className="grid grid-cols-2 gap-2 md:grid-cols-1"><Button variant="outline" size="sm" onClick={() => onReprint(h)}><Printer/>Reimprimir</Button><Button variant="secondary" size="sm" onClick={() => onDuplicate(h)}><Copy/>Duplicar</Button></div></article>)}</div></section>;
}
