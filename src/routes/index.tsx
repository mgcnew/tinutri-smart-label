import { SystemSelect } from "@/components/ui/system-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, format, isValid } from "date-fns";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, ClipboardList, History, LayoutDashboard, ListPlus, LogOut, Menu, PackagePlus, Pencil, Printer, Search, Settings2, ShieldCheck, Smartphone, Trash2, Users, X } from "lucide-react";
import { cloneElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmissionProductPicker } from "@/components/EmissionProductPicker";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OperationalDashboard } from "@/components/OperationalDashboard";
import { AuditActionDetails } from "@/components/AuditActionDetails";
import { LabelDetails } from "@/components/LabelDetails";
import { useFocusedEntity } from "@/hooks/use-focused-entity";
import { useOperationalOverview } from "@/hooks/use-operational-overview";
import { type ExpiryWindow, type RecentAction } from "@/lib/dashboard";
import { AuthLogin } from "@/components/AuthLogin";
import { supabase } from "@/integrations/supabase/client";
import { workspaceSearch, type WorkspaceTab } from "@/lib/workspace-search";
import { CarePanel } from "@/components/master/CarePanel";
import { ClientsPanel } from "@/components/ClientsPanel";
import { ProductsPanel } from "@/components/ProductsPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ValidadesPanel } from "@/components/ValidadesPanel";
import { LabelPreview } from "@/components/LabelPreview";
import { CLIENT_CODE_KEY } from "./e.$code";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { buildPrintDocument, kindLabel, LABEL_KINDS, newLabelToken, qrFor, STORAGE_PRESETS, type LabelKind, type PrintableLabel } from "@/lib/label";
import tinutriLogo from "@/assets/tinutri-logo.png";
import { NetworkPrinterSetup } from "@/components/NetworkPrinterSetup";
import { BUILTIN_LAYOUTS, renderLabelZpl } from "@/lib/label-render";
import { enqueueJob, isAgentOnline, LABELS_PER_JOB, listAgents, waitForJob } from "@/lib/print-queue";
import { joinZpl } from "@/lib/zpl";
import { useAlerts } from "@/hooks/use-alerts";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { AlertBanner, AlertSoundToggle, PushToggle } from "@/components/AlertCenter";
import { ThemeToggle } from "@/components/PreferenceRow";
import { allergenText, normalizeAllergens } from "@/lib/allergens";
import { shelfDaysFor } from "@/lib/shelf-life";
import { settleLabelRecord } from "@/lib/settlement-actions";


export const Route = createFileRoute("/")({
  validateSearch: workspaceSearch,
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

type ClientStatus = "ativa" | "inativa" | "suspensa";
type Client = { id: string; name: string; active: boolean; status: ClientStatus; public_code: string };
type Product = { id: string; client_id: string; name: string; category: string; shelf_life_days: number; requires_lot: boolean; requires_inspection: boolean; inspection_type: "SIF" | "SISP" | "SIM" | null; inspection_number: string | null; notes: string | null; active: boolean; shelf_life_by_storage?: unknown; allergens?: string[] | null };
type Collaborator = { id: string; client_id: string; name: string; role_title: string | null; active: boolean; user_id?: string | null };
type QueueItem = {
  id: string;
  label: PrintableLabel;
  copies: number;
  client_id: string;
  product_id: string;
  responsible_id: string;
  opened_iso: string;
  expires_iso: string;
  opened_at: string;
  expires_at: string;
  allergens: string[];
};

type LabelRecord = { id: string; client_id: string; product_id: string | null; responsible_id: string | null; client_name: string; product_name: string; responsible_name: string; lot_number: string | null; inspection_label: string | null; opened_on: string; issued_at: string; expires_on: string; quantity: number; public_token?: string | null; label_kind?: string | null; label_status?: string | null; storage_condition?: string | null; sector?: string | null; opened_at?: string | null; expires_at?: string | null; print_status?: string | null; confirmed_at?: string | null; reprint_count?: number | null; allergens?: string[] | null };
type ActivityRecorder = (action: string, clientId: string, entityType: string, entityId: string, name: string, before: Record<string, unknown>, after: Record<string, unknown>) => Promise<void>;

type AppTab = WorkspaceTab;
type AppRole = "admin_master" | "nutricionista" | "admin_cliente" | "gerente" | "operator";

const ALERT_DAYS_KEY = "tinutri.expiry-alert-days";
function loadAlertDays(): number {
  if (typeof window === "undefined") return 3;
  const raw = Number(window.localStorage.getItem(ALERT_DAYS_KEY));
  return Number.isFinite(raw) && raw > 0 && raw <= 90 ? Math.floor(raw) : 3;
}

const PRINTER_NOT_FOUND_MESSAGE = "Impressora não encontrada. Verifique a conexão Bluetooth, Wi-Fi ou a configuração da impressora.";

type PrinterType = "elgin";
type ConnectionMode = "browser" | "wifi" | "bluetooth" | "usb";
type LabelSize = "60x40" | "50x30";
type PrinterSettings = {
  type: PrinterType;
  connection: ConnectionMode;
  ip: string;
  /** Impressora de rede cadastrada (modo Wi-Fi / IP): as etiquetas vão pela fila até o agente local. */
  printerId: string;
  size: LabelSize;
  showTime: boolean;
};

const PRINTER_SETTINGS_KEY = "tinutri.printer-settings";
const DEFAULT_SETTINGS: PrinterSettings = { type: "elgin", connection: "browser", ip: "", printerId: "", size: "60x40", showTime: true };

const PRINTER_TYPES: { id: PrinterType; label: string }[] = [
  { id: "elgin", label: "Elgin L42 Pro" },
];
const CONNECTION_MODES: { id: ConnectionMode; label: string }[] = [
  { id: "browser", label: "Impressão pelo navegador" },
  { id: "wifi", label: "Wi-Fi / IP" },
  { id: "bluetooth", label: "Bluetooth" },
  { id: "usb", label: "USB" },
];

function loadSettings(): PrinterSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(PRINTER_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), type: "elgin" };
  } catch { /* Preferências locais são opcionais; os valores padrão continuam disponíveis. */ }
  return DEFAULT_SETTINGS;
}

function sizeMm(size: LabelSize) {
  return size === "50x30" ? { w: 50, h: 30 } : { w: 60, h: 40 };
}

/** Imprime uma etiqueta física por item da lista, cada uma em sua própria página. */
function printThermalBatch(labels: PrintableLabel[], settings: PrinterSettings): boolean {
  if (typeof window === "undefined" || labels.length === 0) return false;
  const { w, h } = sizeMm(settings.size);
  const scale = settings.size === "50x30" ? 0.78 : 1;
  const doc = buildPrintDocument(labels, w, h, scale);
  try {
    // Remove qualquer frame de impressão anterior para não acumular.
    document.querySelectorAll<HTMLIFrameElement>("iframe[data-tinutri-print]").forEach((node) => node.remove());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-tinutri-print", "1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
    iframe.srcdoc = doc;
    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) return;
        win.focus();
        win.print();
      } catch {
        /* ignore — preserva a sessão */
      }
      window.setTimeout(() => iframe.remove(), 4000);
    };
    return true;
  } catch {
    return false;
  }
}


function Index() {
  const entry = Route.useSearch();
  const entryKey = JSON.stringify(entry);
  const appliedEntry = useRef("");
  const [entryCompany, setEntryCompany] = useState("");
  const [entryError, setEntryError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profileClientId, setProfileClientId] = useState<string | null>(null);
  const [carteira, setCarteira] = useState<string[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const handleProductRecord = useCallback((record: Product | null) => setProducts(record ? [record] : []), []);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [overviewRevision, setOverviewRevision] = useState(0);
  const [dashboardClient, setDashboardClient] = useState("");
  const [validityWindow, setValidityWindow] = useState<ExpiryWindow>("all");
  const [detailLabelId, setDetailLabelId] = useState<string | null>(null);
  const [detailAction, setDetailAction] = useState<RecentAction | null>(null);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [activityWarning, setActivityWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const accessScope = role === "admin_master" ? null : role === "nutricionista" ? carteira : profileClientId ? [profileClientId] : [];
  const overviewScope = dashboardClient && (accessScope === null || accessScope.includes(dashboardClient)) ? [dashboardClient] : accessScope;
  const overview = useOperationalOverview(Boolean(userId && role && !loading && tab === "dashboard"), overviewScope, overviewRevision);
  const [message, setMessage] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedResponsible, setSelectedResponsible] = useState("");
  const [openedOn, setOpenedOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [openedTime, setOpenedTime] = useState(format(new Date(), "HH:mm"));
  const [kind, setKind] = useState<LabelKind>("aberto");
  const [storage, setStorage] = useState<string>("");
  const [sector, setSector] = useState("");
  const [previewQr, setPreviewQr] = useState<string | undefined>(undefined);
  const [lot, setLot] = useState("");

  const [shelfDays, setShelfDays] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [label, setLabel] = useState<PrintableLabel | null>(null);
  const [labelDraft, setLabelDraft] = useState<{ product: string; responsible: string; opened: string; expires: string; lot: string } | null>(null);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [emissionBusy, setEmissionBusy] = useState<string | null>(null);
  const emissionLock = useRef(false);
  const settingsButton = useRef<HTMLButtonElement | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRestored = useRef(false);
  const [lastFailedPrint, setLastFailedPrint] = useState<QueueItem[] | null>(null);
  const [pendingPrint, setPendingPrint] = useState<{ rows: { id: string; client_id: string; product_name: string }[]; total: number; product: string } | null>(null);
  const [alertDays, setAlertDays] = useState(3);
  useEffect(() => { setAlertDays(loadAlertDays()); }, []);
  const { counts: alertCounts, items: alertItems } = useAlerts(Boolean(userId && role && !loading), accessScope, overviewRevision, alertDays);
  const alertSound = useAlertSound(alertCounts);
  const urgentCount = (alertCounts?.expired ?? 0) + (alertCounts?.today ?? 0);
  const updateAlertDays = (value: number) => {
    const safe = Math.max(1, Math.min(90, Math.floor(value) || 1));
    setAlertDays(safe);
    try { window.localStorage.setItem(ALERT_DAYS_KEY, String(safe)); } catch { /* Preferências locais são opcionais; os valores padrão continuam disponíveis. */ }
  };


  useEffect(() => { setPrinterSettings(loadSettings()); }, []);

  // Fila de etiquetas sobrevive a recarregar a página: guarda só dados, e os QR Codes são refeitos ao restaurar.
  const queueKey = userId ? `tinutri.emission-queue.${userId}` : null;
  useEffect(() => {
    if (!queueKey || queueRestored.current) return;
    queueRestored.current = true;
    void (async () => {
      try {
        const raw = window.localStorage.getItem(queueKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as unknown;
        if (!Array.isArray(saved)) return;
        const restored: QueueItem[] = [];
        for (const entry of saved as (Omit<QueueItem, "label"> & { label: Omit<PrintableLabel, "issued" | "qrDataUrl"> & { issued: string } })[]) {
          if (!entry?.label?.token || !entry.client_id || !entry.product_id) continue;
          restored.push({ ...entry, label: { ...entry.label, issued: new Date(entry.label.issued), qrDataUrl: await qrFor(entry.label.token) } });
        }
        if (restored.length > 0) setQueue((current) => [...restored, ...current]);
      } catch { /* Fila local é opcional: se estiver corrompida, começa vazia. */ }
    })();
  }, [queueKey]);
  useEffect(() => {
    if (!queueKey || !queueRestored.current) return;
    try {
      if (queue.length === 0) window.localStorage.removeItem(queueKey);
      else window.localStorage.setItem(queueKey, JSON.stringify(queue.map((item) => ({ ...item, label: { ...item.label, qrDataUrl: undefined } }))));
    } catch { /* Sem armazenamento local a fila continua funcionando só na sessão. */ }
  }, [queue, queueKey]);
  // QR Code apenas ilustrativo na pré-visualização; o token real é gerado ao emitir.
  useEffect(() => { void qrFor(newLabelToken()).then(setPreviewQr); }, []);

  const updateSettings = (patch: Partial<PrinterSettings>) => {
    setPrinterSettings((prev) => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(next)); } catch { /* Preferências locais são opcionais; os valores padrão continuam disponíveis. */ }
      return next;
    });
  };

  const selectNetworkPrinter = useCallback((printerId: string) => updateSettings({ printerId }), []);

  const refresh = async () => {
    setLoadingError(null);
    const controller = new AbortController();
    let phase = "verificar sua sessão";
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const checkActive = () => {
      if (controller.signal.aborted) throw new Error("Tempo de resposta excedido.");
    };
    const load = async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      checkActive();
      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      const id = auth.user?.id ?? null;
      setUserId(id);
      if (!id) return;
      phase = "carregar seu perfil de acesso";
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id).abortSignal(controller.signal).maybeSingle(),
        supabase.from("profiles").select("client_id,name,email").eq("user_id", id).abortSignal(controller.signal).maybeSingle(),
      ]);
      checkActive();
      if (rolesResult.error) throw rolesResult.error;
      if (profileResult.error) throw profileResult.error;
      const roles = rolesResult.data;
      const profile = profileResult.data;
      const rawRole = roles?.role as string | undefined;
      const currentRole: AppRole | undefined =
        rawRole === "operator" ? "operator"
        : rawRole === "nutricionista" ? "nutricionista"
        : rawRole === "admin_cliente" ? "admin_cliente"
        : rawRole === "gerente" ? "gerente"
        : (rawRole === "admin_master" || rawRole === "admin") ? "admin_master"
        : undefined;
      setUserName(profile?.name ?? profile?.email ?? "");
      // Tab padrão por perfil — aplicar apenas na primeira carga (evita resetar a aba após imprimir/salvar)
      setRole((prevRole) => {
        if (prevRole === null && currentRole) {
          if (currentRole === "operator") setTab("dashboard");
          else if (currentRole === "admin_cliente" || currentRole === "gerente" || currentRole === "nutricionista") setTab("dashboard");
        }
        return currentRole ?? null;
      });
      const ownClient = profile?.client_id ?? null;
      setProfileClientId(ownClient);
      // Carteira da nutricionista
      let carteiraIds: string[] = [];
      if (currentRole === "nutricionista") {
        phase = "carregar sua carteira de clientes";
        const { data: cart, error: carteiraError } = await supabase.from("nutritionist_clients").select("client_id").eq("nutritionist_user_id", id).abortSignal(controller.signal);
        checkActive();
        if (carteiraError) throw carteiraError;
        carteiraIds = (cart ?? []).map((r) => r.client_id as string);
        setCarteira(carteiraIds);
      } else {
        setCarteira([]);
      }
      phase = "carregar os dados da sua estação";
      const allowedClientIds: string[] | null = currentRole === "admin_master" ? null : currentRole === "nutricionista" ? carteiraIds : ownClient ? [ownClient] : [];
      let clientsQuery = supabase.from("clients").select("id,name,active,status,public_code").order("name").order("id").abortSignal(controller.signal);
      let collaboratorsQuery = supabase.from("collaborators").select("id,client_id,name,role_title,active,user_id").eq("active", true).order("name").abortSignal(controller.signal);
      if (allowedClientIds) {
        clientsQuery = clientsQuery.in("id", allowedClientIds.length ? allowedClientIds : ["00000000-0000-0000-0000-000000000000"]);
        collaboratorsQuery = collaboratorsQuery.in("client_id", allowedClientIds.length ? allowedClientIds : ["00000000-0000-0000-0000-000000000000"]);
      }
      const [clientsResult, collaboratorsResult] = await Promise.all([clientsQuery, collaboratorsQuery]);
      checkActive();
      for (const result of [clientsResult, collaboratorsResult]) if (result.error) throw result.error;
      // Compact names for selectors; full client and product records are loaded on demand.
      const allClients = (clientsResult.data ?? []) as Client[];
      const allCollab = (collaboratorsResult.data ?? []) as Collaborator[];
      const filterByClient = <T extends { client_id?: string; id?: string }>(rows: T[], keyIsId = false): T[] => {
        if (allowedClientIds === null) return rows;
        const set = new Set(allowedClientIds);
        return rows.filter((r) => set.has((keyIsId ? r.id : r.client_id) as string));
      };
      setClients(allowedClientIds === null ? allClients : allClients.filter((c) => allowedClientIds!.includes(c.id)));
      setCollaborators(filterByClient(allCollab));
      if (ownClient) setSelectedClient(ownClient);
      // QR Code do estabelecimento: valida se o usuário realmente pertence/tem acesso àquele cliente
      try {
        const pendingCode = window.localStorage.getItem(CLIENT_CODE_KEY);
        if (pendingCode) {
          window.localStorage.removeItem(CLIENT_CODE_KEY);
          const visible = allowedClientIds === null ? allClients : allClients.filter((c) => allowedClientIds!.includes(c.id));
          const target = visible.find((c) => c.public_code === pendingCode);
          if (target) { setSelectedClient(target.id); setTab("emit"); setMessage(`Ambiente de ${target.name} aberto.`); }
          else setMessage("Você não tem acesso ao estabelecimento deste QR Code.");
        }
      } catch { /* ignore */ }
      const suspendedOwn = allClients.find((c) => c.id === ownClient && c.status === "suspensa");
      if (suspendedOwn) return;
      setOverviewRevision((value) => value + 1);
    };
    try {
      await Promise.race([
        load(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error("Tempo de resposta excedido."));
            controller.abort();
          }, 20000);
        }),
      ]);
    } catch (error) {
      const timedOut = controller.signal.aborted;
      controller.abort();
      console.error(`[Estação] Falha ao ${phase}`, error);
      setLoadingError(timedOut
        ? `O servidor demorou para ${phase}. Verifique sua conexão e tente novamente.`
        : `Não foi possível ${phase}. Tente novamente. Se continuar, entre em contato com a TiNutri.`);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const activeClients = useMemo(() => clients.filter(c => c.active), [clients]);
  const visibleCollaborators = collaborators.filter((item) => item.client_id === selectedClient);
  // Responsável pré-selecionado: o próprio usuário, se for colaborador; senão o último escolhido nesta empresa.
  useEffect(() => {
    if (!selectedClient || selectedResponsible) return;
    const own = visibleCollaborators.find((item) => item.user_id && item.user_id === userId);
    let remembered: string | null = null;
    try { remembered = window.localStorage.getItem(`tinutri.last-responsible.${selectedClient}`); } catch { /* Preferência local opcional. */ }
    const pick = own ?? visibleCollaborators.find((item) => item.id === remembered);
    if (pick) setSelectedResponsible(pick.id);
  }, [selectedClient, selectedResponsible, visibleCollaborators, userId]);
  const product = products.find((item) => item.id === selectedProduct);
  const responsible = collaborators.find((item) => item.id === selectedResponsible);
  const client = clients.find((item) => item.id === selectedClient);
  const enteredShelfDays = Number(shelfDays);
  const effectiveShelfDays = shelfDays.trim() && Number.isInteger(enteredShelfDays) && enteredShelfDays >= 0 && enteredShelfDays <= 3650 ? enteredShelfDays : product?.shelf_life_days ?? 0;
  const rawOpenedAt = new Date(`${labelDraft?.opened || openedOn}T${openedTime || "00:00"}:00`);
  const openedAtPreview = isValid(rawOpenedAt) ? rawOpenedAt : new Date();
  const calculatedExpiry = addDays(openedAtPreview, effectiveShelfDays);
  const rawExpiryOverride = labelDraft?.expires ? new Date(`${labelDraft.expires}T${openedTime || "00:00"}:00`) : calculatedExpiry;
  const expiresAtPreview = isValid(rawExpiryOverride) ? rawExpiryOverride : calculatedExpiry;
  const expiresOn = product ? format(expiresAtPreview, "dd/MM/yyyy 'às' HH:mm") : "—";
  const emissionError = /não foi possível|não encontrada|confira|selecione|exige|falha/i.test(message);
  const emissionReady = Boolean(client && product && responsible && (!labelDraft || (labelDraft.opened && labelDraft.expires)) && isValid(rawOpenedAt) && isValid(rawExpiryOverride) && shelfDays.trim() && Number.isInteger(enteredShelfDays) && enteredShelfDays >= 0 && enteredShelfDays <= 3650 && Number.isInteger(Number(quantity)) && Number(quantity) >= 1 && Number(quantity) <= 200 && (!product.requires_lot || (labelDraft?.lot ?? lot).trim()));
  const previewLabel: PrintableLabel = {
    kind,
    product: labelDraft?.product || product?.name || "NOME DO PRODUTO",
    opened: format(openedAtPreview, "dd/MM/yyyy HH:mm"),
    expires: format(expiresAtPreview, "dd/MM/yyyy HH:mm"),
    storage: storage || undefined,
    sector: sector.trim() || undefined,
    lot: (labelDraft?.lot ?? lot) || undefined,
    inspection: product?.requires_inspection && product.inspection_type && product.inspection_number ? `${product.inspection_type}: ${product.inspection_number}` : undefined,
    allergens: allergenText(product?.allergens),
    responsible: labelDraft?.responsible || responsible?.name || "RESPONSÁVEL",
    issued: new Date(),
    qrDataUrl: previewQr,
  };


  useEffect(() => {
    if (loading || !role || !userId || appliedEntry.current === entryKey) return;
    const requested = workspaceSearch(JSON.parse(entryKey));
    appliedEntry.current = entryKey;
    setEntryError("");
    if (!requested.painel || !ROLE_TABS[role].includes(requested.painel)) return;
    const allowed = role === "admin_master" ? null : role === "nutricionista" ? carteira : profileClientId ? [profileClientId] : [];
    if (requested.empresa && allowed !== null && !allowed.includes(requested.empresa)) {
      setEntryError("Você não tem acesso a esta empresa.");
      return;
    }
    setTab(requested.painel);
    setValidityWindow(requested.janela ?? "all");
    setFocusedEntityId(requested.registro ?? null);
    setEntryCompany(requested.empresa ?? "");
    setDashboardClient(requested.empresa ?? "");
    if (requested.empresa) {
      const companyId = requested.empresa;
      void supabase.from("clients").select("id,name,active,status,public_code").eq("id", companyId).maybeSingle().then(({data, error}) => {
        if (error || !data) { setEntryError("Não foi possível abrir a empresa selecionada."); return; }
        setClients(previous => previous.some(item => item.id === data.id) ? previous : [...previous, data as Client]);
      });
    }
  }, [loading, role, userId, entryKey, carteira, profileClientId]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-background"><p className="font-semibold text-muted-foreground">Preparando sua estação…</p></main>;

  if (loadingError) return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
        <Brand />
        <h1 className="mt-6 text-xl font-bold">Não conseguimos abrir sua estação</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-muted-foreground">{loadingError}</p>
        <div className="mt-6 grid gap-3">
          <Button onClick={() => { setLoading(true); void refresh(); }}>Tentar novamente</Button>
          <Button variant="outline" onClick={async () => {
            try {
              const { error } = await supabase.auth.signOut({ scope: "local" });
              if (error) throw error;
              window.location.reload();
            } catch {
              setLoadingError("Não foi possível sair da conta. Verifique sua conexão e tente novamente.");
            }
          }}>Voltar para o login</Button>
        </div>
      </section>
    </main>
  );

  if (!userId) return <AuthLogin />;

  // Empresa suspensa bloqueia uso operacional (dados preservados)
  {
    const ownClient = clients.find((c) => c.id === profileClientId);
    if (ownClient && ownClient.status === "suspensa") {
      return (
        <main className="grid min-h-screen place-items-center bg-background p-5">
          <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl text-center">
            <Brand />
            <h1 className="mt-6 text-2xl font-bold">Acesso suspenso</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Seu acesso foi temporariamente suspenso. Entre em contato com a TiNutri.
            </p>
            <Button className="mt-6 w-full" variant="outline" onClick={async () => { await supabase.auth.signOut(); location.reload(); }}>Sair</Button>
          </section>
        </main>
      );
    }
  }

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

  const navigateTab = (nextTab: AppTab) => {
    setFocusedEntityId(null);
    if (nextTab === "validades") setValidityWindow("all");
    setTab(nextTab);
  };
  const canOpenAuditEntity = detailAction?.entity_id && role !== "operator" && (
    (detailAction.entity_type === "product" && (overviewScope === null || overviewScope.includes(detailAction.client_id)))
    || (detailAction.entity_type === "collaborator" && collaborators.some((item) => item.id === detailAction.entity_id))
    || (detailAction.entity_type === "client" && role === "admin_master")
    || (detailAction.entity_type === "care" && (role === "admin_master" || role === "nutricionista") && (overviewScope === null || overviewScope.includes(detailAction.client_id)))
  );
  const recordActivity: ActivityRecorder = async (action, clientId, entityType, entityId, name, before, after) => {
    try {
      const { error } = await supabase.from("activity_logs").insert({ user_id: userId, user_name: userName || null, client_id: clientId, action, entity_type: entityType, entity_id: entityId, metadata: { name, before, after } as never });
      if (error) throw error;
    } catch {
      setActivityWarning("O cadastro foi salvo, mas não foi possível registrar esta ação no histórico.");
    }
  };

  const buildCurrentItem = async (): Promise<QueueItem | null> => {
    if (!client || !product || !responsible) { setMessage("Selecione cliente, produto e responsável."); return null; }
    if (product.requires_lot && !(labelDraft?.lot ?? lot).trim()) { setMessage("Este produto exige número de lote."); return null; }
    if (!emissionReady) { setMessage("Confira datas, validade e quantidade (1 a 200 etiquetas)."); return null; }
    const copies = Number(quantity);
    const issued = new Date();
    const effectiveOpened = labelDraft?.opened || openedOn;
    const expiry = labelDraft?.expires || format(addDays(new Date(`${effectiveOpened}T12:00:00`), effectiveShelfDays), "yyyy-MM-dd");
    const openedAt = new Date(`${effectiveOpened}T${openedTime || "00:00"}:00`);
    const expiresAt = new Date(`${expiry}T${openedTime || "00:00"}:00`);
    const inspection = product.requires_inspection && product.inspection_type && product.inspection_number ? `${product.inspection_type}: ${product.inspection_number}` : undefined;
    const token = newLabelToken();
    return {
      id: crypto.randomUUID(),
      copies,
      client_id: client.id,
      product_id: product.id,
      responsible_id: responsible.id,
      opened_iso: effectiveOpened,
      expires_iso: expiry,
      opened_at: openedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      allergens: normalizeAllergens(product.allergens),
      label: {
        kind,
        product: labelDraft?.product.trim() || product.name,
        opened: format(openedAt, "dd/MM/yyyy HH:mm"),
        expires: format(expiresAt, "dd/MM/yyyy HH:mm"),
        storage: storage || undefined,
        sector: sector.trim() || undefined,
        lot: (labelDraft?.lot ?? lot).trim() || undefined,
        inspection,
        allergens: allergenText(product.allergens),
        responsible: labelDraft?.responsible.trim() || responsible.name,
        issued,
        token,
        qrDataUrl: await qrFor(token),
      },
    };
  };

  const addToQueue = async () => {
    setMessage("");
    const item = await buildCurrentItem();
    if (!item) return;
    setQueue((q) => [...q, item]);
    setLot(""); setLabelDraft(null); setQuantity("1");
    setMessage(`Etiqueta adicionada à fila (${item.copies}× ${item.label.product}).`);
  };

  const removeFromQueue = (id: string) => setQueue((q) => q.filter((it) => it.id !== id));
  const updateQueueCopies = (id: string, copies: number) =>
    setQueue((q) => q.map((it) => it.id === id ? { ...it, copies: Math.max(1, Math.min(200, Math.floor(copies) || 1)) } : it));

  /** Cada cópia impressa é uma etiqueta física distinta: recebe token e QR Code próprios. */
  const expandUnits = async (items: QueueItem[]) => {
    const units: { item: QueueItem; label: PrintableLabel }[] = [];
    for (const it of items) {
      for (let i = 0; i < Math.max(1, it.copies); i += 1) {
        const token = i === 0 && it.label.token ? it.label.token : newLabelToken();
        units.push({ item: it, label: { ...it.label, token, qrDataUrl: await qrFor(token) } });
      }
    }
    return units;
  };

  /** Registra um evento na linha do tempo da etiqueta (emissão, confirmação, falha, reimpressão, baixa). */
  const logLabelEvent = async (labelId: string, clientId: string, eventType: string, quantity = 1, metadata: Record<string, unknown> = {}) => {
    try {
      const { error } = await supabase.from("label_events").insert({
        label_id: labelId, client_id: clientId, event_type: eventType,
        user_id: userId, user_name: userName || null, quantity, metadata: metadata as never,
      });
      if (error) throw error;
      return true;
    } catch {
      setActivityWarning("A etiqueta foi atualizada, mas não foi possível registrar esta ação na linha do tempo.");
      return false;
    }
  };

  const dispatchPrint = async (items: QueueItem[]) => {
    if (items.length === 0) return false;
    const useNetworkQueue = printerSettings.connection === "wifi" && Boolean(printerSettings.printerId);
    // Sem agente conectado nada seria impresso: avisa antes de registrar etiquetas que ficariam órfãs.
    if (useNetworkQueue && !(await networkAgentOnline(items[0].client_id))) {
      setLastFailedPrint(items);
      setMessage("O agente de impressão está desligado. Abra o programa no computador da impressora e tente novamente.");
      return false;
    }
    const units = await expandUnits(items);
    const rows = units.map(({ item, label }) => ({
      client_id: item.client_id, product_id: item.product_id, responsible_id: item.responsible_id, issued_by: userId,
      client_name: clients.find(c => c.id === item.client_id)?.name ?? "", product_name: label.product, responsible_name: label.responsible,
      lot_number: label.lot ?? null, inspection_label: label.inspection ?? null,
      allergens: item.allergens,
      opened_on: item.opened_iso, expires_on: item.expires_iso, quantity: 1,
      public_token: label.token, label_kind: label.kind,
      storage_condition: label.storage ?? null, sector: label.sector ?? null,
      opened_at: item.opened_at, expires_at: item.expires_at,
      print_status: "preparada",
    }));
    // Etiquetas nascem "preparadas": só entram no controle PVPS após a confirmação da impressão física.
    const { data: inserted, error } = await supabase.from("issued_labels").insert(rows as never).select("id,client_id,product_name");
    if (error) { setLastFailedPrint(items); setMessage("Não foi possível registrar a etiqueta. Verifique seu acesso."); return false; }
    const created = (inserted ?? []) as { id: string; client_id: string; product_name: string }[];
    await Promise.all(created.map((row) => logLabelEvent(row.id, row.client_id, "emissao")));
    const lastLabel = units[units.length - 1].label;
    if (useNetworkQueue) return finishNetworkPrint(items, units.map((u) => u.label), created, lastLabel);
    const ok = printThermalBatch(units.map((u) => u.label), printerSettings);
    if (!ok) { setLastFailedPrint(items); await markPrintFailed(created, "impressora_indisponivel"); setMessage(PRINTER_NOT_FOUND_MESSAGE); return false; }
    setMessage(`${units.length} etiqueta(s) enviada(s) para a impressora. Confirme abaixo se a impressão saiu correta.`);
    setPendingPrint({ rows: created, total: created.length, product: lastLabel.product });
    setLabel(lastLabel);
    setLastFailedPrint(null);
    await refresh();
    return true;
  };

  const networkAgentOnline = async (clientId: string) => {
    try { return (await listAgents(clientId)).some((a) => isAgentOnline(a)); } catch { return false; }
  };

  /** Renderiza o ZPL, enfileira em lotes e acompanha o agente. Só o que a impressora aceitou entra no PVPS. */
  const sendToNetworkPrinter = async (clientId: string, labels: PrintableLabel[], ids: string[]) => {
    const { w, h } = sizeMm(printerSettings.size);
    for (let start = 0; start < labels.length; start += LABELS_PER_JOB) {
      const slice = labels.slice(start, start + LABELS_PER_JOB);
      const zpl = joinZpl(await Promise.all(slice.map((l) => renderLabelZpl(l, { widthMm: w, heightMm: h }, BUILTIN_LAYOUTS[0]))));
      const jobId = await enqueueJob({ clientId, printerId: printerSettings.printerId, payload: zpl, labelIds: ids.slice(start, start + LABELS_PER_JOB), userId: userId ?? "" });
      const result = await waitForJob(jobId);
      if (!result.ok) return { ...result, printed: start };
    }
    return { ok: true as const, printed: labels.length };
  };

  const finishNetworkPrint = async (items: QueueItem[], labels: PrintableLabel[], created: { id: string; client_id: string; product_name: string }[], lastLabel: PrintableLabel) => {
    setMessage(`Enviando ${labels.length} etiqueta(s) para a impressora…`);
    let result: Awaited<ReturnType<typeof sendToNetworkPrinter>>;
    try { result = await sendToNetworkPrinter(created[0].client_id, labels, created.map((r) => r.id)); }
    catch { result = { ok: false, reason: "Não foi possível enviar à fila de impressão.", printed: 0 }; }
    const printedRows = created.slice(0, result.printed);
    const failedRows = created.slice(result.printed);
    // O agente só marca "enviada" depois que a impressora recebeu os dados: isso dispensa a confirmação manual.
    if (printedRows.length > 0) {
      const { error } = await supabase.from("issued_labels")
        .update({ print_status: "confirmada", confirmed_at: new Date().toISOString(), confirmed_by: userId } as never)
        .in("id", printedRows.map((r) => r.id)).eq("print_status", "preparada");
      if (!error) await Promise.all(printedRows.map((r) => logLabelEvent(r.id, r.client_id, "impressao_confirmada", 1, { via: "agente_rede" })));
    }
    if (!result.ok) {
      await markPrintFailed(failedRows, "falha_agente_rede").catch(() => undefined);
      setLastFailedPrint(items);
      setMessage(`${result.reason}${printedRows.length > 0 ? ` ${printedRows.length} etiqueta(s) já tinham saído; reimprima apenas as demais pelo histórico.` : ""}`);
      await refresh();
      return false;
    }
    setMessage(`${labels.length} etiqueta(s) impressas e registradas no controle de validades.`);
    setLabel(lastLabel);
    setLastFailedPrint(null);
    await refresh();
    return true;
  };

  /** Impressão não confirmada / com erro: nunca dá baixa no PVPS. */
  const markPrintFailed = async (rows: { id: string; client_id: string }[], reason: string) => {
    if (rows.length === 0) return;
    const { error } = await supabase.from("issued_labels").update({ print_status: "falha" } as never).in("id", rows.map((r) => r.id));
    if (error) throw new Error("Não foi possível registrar a falha da impressão.");
    await Promise.all(rows.map((r) => logLabelEvent(r.id, r.client_id, "falha_impressao", 1, { reason })));
  };

  const confirmPendingPrint = async () => {
    const pending = pendingPrint;
    if (!pending) return;
    const ids = pending.rows.map((r) => r.id);
    const { error } = await supabase
      .from("issued_labels")
      .update({ print_status: "confirmada", confirmed_at: new Date().toISOString(), confirmed_by: userId } as never)
      .in("id", ids)
      .eq("print_status", "preparada"); // evita baixa duplicada
    if (error) { setMessage("Não foi possível confirmar a saída. Tente novamente."); return; }
    setPendingPrint(null);
    await Promise.all(pending.rows.map((r) => logLabelEvent(r.id, r.client_id, "impressao_confirmada")));
    setMessage(`Saída confirmada: ${pending.total} etiqueta(s) de ${pending.product} entraram no controle de validades.`);
    await refresh();
  };

  const rejectPendingPrint = async () => {
    const pending = pendingPrint;
    if (!pending) return;
    await markPrintFailed(pending.rows, "nao_confirmada_pelo_usuario");
    setPendingPrint(null);
    setMessage("Impressão marcada como falha. Nenhuma saída foi registrada — você pode imprimir novamente.");
    await refresh();
  };

  /** Baixa manual no painel PVPS (utilizada, consumida ou descartada). */
  const settleLabel = async (record: LabelRecord, status: "utilizada" | "consumida" | "descartada", reason?: string | null) => {
    const { result, eventLogged } = await settleLabelRecord({ id: record.id, clientId: record.client_id, userId, userName, status, reason });
    if (result === "erro") { setMessage("Não foi possível registrar a baixa."); return false; }
    if (result === "ja-baixada") { setMessage("Esta etiqueta já recebeu baixa. Atualize o panorama."); await refresh(); return false; }
    if (!eventLogged) setActivityWarning("A etiqueta foi atualizada, mas não foi possível registrar esta ação na linha do tempo.");
    await refresh();
    return true;
  };

  const performEmission = async (action: string, work: () => Promise<unknown>) => {
    if (emissionLock.current) return;
    if (pendingPrint && ["now", "queue", "retry"].includes(action)) { setMessage("Confirme a impressão anterior antes de enviar outras etiquetas."); return; }
    emissionLock.current = true; setEmissionBusy(action);
    try { await work(); }
    catch { setMessage("Não foi possível concluir a operação. Confira sua conexão e tente novamente."); }
    finally { emissionLock.current = false; setEmissionBusy(null); }
  };

  const printNow = async () => {
    setMessage(""); setLastFailedPrint(null);
    const item = await buildCurrentItem();
    if (!item) return;
    const ok = await dispatchPrint([item]);
    if (ok) setLabelDraft(null);
  };

  const printQueue = async () => {
    if (queue.length === 0) return;
    setMessage(""); setLastFailedPrint(null);
    const ok = await dispatchPrint(queue);
    if (ok) setQueue([]);
  };

  const retryLastPrint = async () => {
    const items = lastFailedPrint;
    if (!items || items.length === 0) return;
    setMessage("Tentando imprimir novamente…");
    await dispatchPrint(items);
  };

  const testPrint = async () => {
    const now = new Date();
    const token = newLabelToken();
    const sample: PrintableLabel = {
      kind: "manipulado",
      product: "TESTE DE IMPRESSÃO",
      opened: format(now, "dd/MM/yyyy HH:mm"),
      expires: format(addDays(now, 7), "dd/MM/yyyy HH:mm"),
      storage: STORAGE_PRESETS[0],
      sector: "COZINHA",
      lot: "0001",
      responsible: "TINUTRI",
      issued: now,
      token,
      qrDataUrl: await qrFor(token),
    };
    if (printerSettings.connection === "wifi" && printerSettings.printerId) {
      const cid = client?.id;
      if (!cid || !(await networkAgentOnline(cid))) { setMessage("O agente de impressão está desligado. Abra o programa no computador da impressora."); return; }
      const { w, h } = sizeMm(printerSettings.size);
      try {
        const jobId = await enqueueJob({ clientId: cid, printerId: printerSettings.printerId, payload: await renderLabelZpl(sample, { widthMm: w, heightMm: h }, BUILTIN_LAYOUTS[0]), labelIds: [], userId: userId ?? "" });
        const result = await waitForJob(jobId);
        setMessage(result.ok ? "Etiqueta de teste enviada para a impressora." : result.reason);
      } catch { setMessage("Não foi possível enviar o teste à fila de impressão."); }
      return;
    }
    const ok = printThermalBatch([sample], printerSettings);
    setMessage(ok ? "Etiqueta de teste enviada para impressão." : PRINTER_NOT_FOUND_MESSAGE);
  };

  /** Reimpressão preserva o token original: a etiqueta física continua sendo a mesma. */
  const reprintLabel = async (record: LabelRecord) => {
    const openedAt = record.opened_at ? new Date(record.opened_at) : new Date(`${record.opened_on}T12:00:00`);
    const expiresAt = record.expires_at ? new Date(record.expires_at) : new Date(`${record.expires_on}T12:00:00`);
    const historicalLabel: PrintableLabel = {
      kind: (record.label_kind ?? "aberto") as LabelKind,
      product: record.product_name,
      opened: format(openedAt, "dd/MM/yyyy HH:mm"),
      expires: format(expiresAt, "dd/MM/yyyy HH:mm"),
      storage: record.storage_condition ?? undefined,
      sector: record.sector ?? undefined,
      lot: record.lot_number ?? undefined,
      inspection: record.inspection_label ?? undefined,
      allergens: allergenText(record.allergens),
      responsible: record.responsible_name,
      issued: new Date(record.issued_at),
      token: record.public_token ?? undefined,
      qrDataUrl: record.public_token ? await qrFor(record.public_token) : undefined,
    };
    setLabel(historicalLabel);
    setTab("emit");
    if (!printThermalBatch(Array.from({ length: record.quantity || 1 }, () => historicalLabel), printerSettings)) {
      setMessage(PRINTER_NOT_FOUND_MESSAGE);
      return;
    }
    // Reimpressão: mesma etiqueta física, sem nova saída no PVPS — apenas registro no histórico.
    await supabase.from("issued_labels").update({ reprint_count: (record.reprint_count ?? 0) + 1 } as never).eq("id", record.id);
    await logLabelEvent(record.id, record.client_id, "reimpressao", record.quantity || 1);
    setMessage("Reimpressão registrada no histórico. Nenhuma nova saída foi lançada no controle de validades.");
    await refresh();
  };


  const duplicateLabel = (record: LabelRecord) => {
    setSelectedClient(record.client_id);
    setSelectedProduct(record.product_id ?? "");
    setSelectedResponsible(record.responsible_id ?? "");
    setOpenedOn(record.opened_on);
    setOpenedTime(record.opened_at ? format(new Date(record.opened_at), "HH:mm") : format(new Date(), "HH:mm"));
    if (record.label_kind) setKind(record.label_kind as LabelKind);
    setStorage(record.storage_condition ?? "");
    setSector(record.sector ?? "");
    setLot(record.lot_number ?? "");
    setQuantity(String(record.quantity || 1));
    setLabel(null);
    setLabelDraft({ product: record.product_name, responsible: record.responsible_name, opened: record.opened_on, expires: record.expires_on, lot: record.lot_number ?? "" });
    setMessage("");
    setTab("emit");
  };

  const preferences = <>
    <PushToggle userId={userId} />
    <AlertSoundToggle enabled={alertSound.enabled} blocked={alertSound.blocked} onEnable={() => void alertSound.enable()} onDisable={alertSound.disable} />
    <ThemeToggle />
  </>;
  return (
    <div className="workspace-shell min-h-screen bg-background">
      <AuditActionDetails action={detailAction?.source === "activity" ? detailAction : null} onClose={() => setDetailAction(null)} onOpenEntity={canOpenAuditEntity && detailAction ? () => {
        setFocusedEntityId(detailAction.entity_id!);
        setTab(detailAction.entity_type === "product" ? "products" : detailAction.entity_type === "collaborator" ? "team" : detailAction.entity_type === "care" ? "acompanhamento" : "clients");
        setDetailAction(null);
      } : undefined} />
      <LabelDetails labelId={detailLabelId} action={detailAction?.source === "activity" ? null : detailAction} revision={overviewRevision} onClose={() => { setDetailLabelId(null); setDetailAction(null); }} onSettle={settleLabel} onReprint={reprintLabel} />
      <header className="workspace-header sticky top-0 z-30 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
        <div className="workspace-topbar flex min-w-0 items-center gap-3">
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menu"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="flex w-[86%] max-w-xs flex-col gap-0 p-5">
                <SheetHeader className="border-b pb-5 text-left"><SheetTitle><Brand /></SheetTitle></SheetHeader>
                <nav aria-label="Menu principal" className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto"><Nav role={role} tab={tab} setTab={navigateTab} badges={{ validades: urgentCount }} closeOnSelect /></nav>
                <WorkspaceActions role={role} preferences={preferences} closeOnSelect />
              </SheetContent>
            </Sheet>
          </div>
          <Brand />
          <UserStrip userName={userName} role={role} clientName={clients.find((c) => c.id === (profileClientId ?? selectedClient))?.name ?? null} />
        </div>
      </header>
      <div className="workspace-layout flex">
        <aside className="workspace-sidebar hidden w-60 shrink-0 lg:block">
          <div className="workspace-sidebar-content flex flex-col">
            <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Navegação</p>
            <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              <Nav role={role} tab={tab} setTab={navigateTab} badges={{ validades: urgentCount }} />
            </nav>
            <WorkspaceActions role={role} preferences={preferences} />
          </div>
        </aside>
        <main className="workspace-main min-w-0 flex-1">
          <AlertBanner counts={alertCounts} items={alertItems} soonDays={alertDays} onOpen={(window) => { setValidityWindow(window); setTab("validades"); }} />
          {entryError && <p role="alert" className="clients-error mb-5">{entryError}</p>}
          {entryCompany && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm"><span>Empresa selecionada: <strong>{clients.find(item => item.id === entryCompany)?.name ?? "Carregando…"}</strong></span><Button variant="ghost" size="sm" onClick={() => { setEntryCompany(""); setDashboardClient(""); }}>Limpar seleção</Button></div>}
          {activityWarning && <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl border border-accent bg-card p-4 text-sm"><p className="flex-1">{activityWarning}</p><Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setActivityWarning(null)}><X /></Button></div>}
          {tab === "dashboard" && <OperationalDashboard overview={overview} clients={clients} userName={userName} role={role} clientId={dashboardClient} onClientChange={setDashboardClient} onNavigate={navigateTab} onWindow={(window) => { setValidityWindow(window); setTab("validades"); }} onLabel={(id) => { setDetailAction(null); setDetailLabelId(id); }} onAction={(action) => { setDetailAction(action); setDetailLabelId(action.source === "activity" ? null : action.label_id); }} />}
          {tab === "emit" && <section className="emission-page space-y-6">
            <header className="dashboard-heading"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Estação de etiquetagem</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Emitir etiquetas</h1><p className="mt-2 text-sm text-muted-foreground">Prepare uma etiqueta ou monte uma fila para imprimir em lote.</p></div></header>
            <div className="emit-printer flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="flex min-w-0 items-center gap-3"><Printer className="size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">Impressora e etiqueta</p><p className="mt-1 break-words text-sm font-medium">{PRINTER_TYPES.find(t => t.id === printerSettings.type)?.label} · {printerSettings.size.replace("x", " × ")} mm <span className="text-xs text-muted-foreground">· {CONNECTION_MODES.find(c => c.id === printerSettings.connection)?.label}</span></p></div></div>
              <Button ref={settingsButton} variant="outline" className="min-h-11" onClick={() => { setMessage(""); setShowPrinterSettings(true); }}><Settings2 />Configurações</Button>
            </div>
            <Dialog open={showPrinterSettings} onOpenChange={setShowPrinterSettings}>
              <DialogContent className="client-dialog printer-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0" overlayClassName="bg-black/35 backdrop-blur-[2px]" onCloseAutoFocus={(event) => { event.preventDefault(); settingsButton.current?.focus(); }}>
                <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left sm:px-6"><DialogTitle>Configurações de impressão</DialogTitle><DialogDescription className="mt-2 text-xs leading-relaxed">As alterações são salvas automaticamente neste navegador.</DialogDescription></DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmitField label="Impressora">
                    <input value={PRINTER_TYPES[0].label} readOnly aria-readonly="true" />
                  </EmitField>
                  <EmitField label="Modo de conexão">
                    <SystemSelect value={printerSettings.connection} onChange={(e) => updateSettings({ connection: e.target.value as ConnectionMode })}>
                      {CONNECTION_MODES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </SystemSelect>
                  </EmitField>
                  {printerSettings.connection === "wifi" && (
                    <NetworkPrinterSetup
                      clientId={client?.id ?? null}
                      clientName={client?.name}
                      canManage={role !== null && role !== "operator"}
                      printerId={printerSettings.printerId}
                      onSelect={selectNetworkPrinter}
                    />
                  )}
                  <EmitField label="Tamanho da etiqueta">
                    <SystemSelect value={printerSettings.size} onChange={(e) => updateSettings({ size: e.target.value as LabelSize })}>
                      <option value="60x40">60 mm × 40 mm (padrão)</option>
                      <option value="50x30">50 mm × 30 mm (opcional)</option>
                    </SystemSelect>
                  </EmitField>
                  <EmitField label="Avisar “próximo de vencer” com quantos dias de antecedência" hint="1 a 90 dias">
                    <input type="number" min={1} max={90} value={alertDays} onChange={(e) => updateAlertDays(Number(e.target.value))} />
                  </EmitField>
                  <p className="rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground sm:col-span-2">
                    A etiqueta imprime data e hora de manipulação/abertura e de validade, além do QR Code individual de rastreio.
                  </p>

                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <Button variant="outline" disabled={Boolean(emissionBusy) || Boolean(pendingPrint)} onClick={() => { setMessage(""); void performEmission("test", testPrint); }}><Printer /> Imprimir 1 etiqueta de teste</Button>
                  </div>
                  <details className="sm:col-span-2 rounded-xl border bg-muted/30 p-4 text-xs leading-6"><summary className="cursor-pointer font-semibold">Orientações para Elgin e impressão pelo computador</summary>
                    <strong className="block text-sm">Elgin L42 Pro Full (USB no computador)</strong>
                    <p className="mt-1 text-muted-foreground">
                      Na janela de impressão que abrir, escolha a <strong>Elgin L42</strong>, deixe as margens em zero e a escala em 100% (sem “ajustar à página”).
                      A etiqueta já sai no tamanho exato de {printerSettings.size.replace("x", " × ")} mm.
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      No driver ou no utilitário da Elgin, no computador, selecione <strong>Térmica direta (sem ribbon)</strong> e o papel {printerSettings.size.replace("x", " × ")} mm.
                      Essa configuração é da impressora: o site não consegue alterá-la sozinho.
                    </p>
                    <p className="mt-2 flex gap-2 text-muted-foreground"><Smartphone className="mt-0.5 size-4 shrink-0" />
                      No iPhone você cria e consulta etiquetas normalmente. Imprimir direto na Elgin pelo celular exige uma integração compatível, que ainda não está disponível aqui — prepare no celular e imprima pelo computador ligado à impressora.
                    </p>
                  </details>
                </div>

                  {message && <p role={emissionError ? "alert" : "status"} className={`${emissionError ? "clients-error" : "clients-notice"} mt-4`}>{message}</p>}
                </div>
                <div className="client-dialog-footer shrink-0 border-t px-5 py-4 text-right sm:px-6"><Button className="dashboard-primary" onClick={() => setShowPrinterSettings(false)}>Concluir</Button></div>
              </DialogContent>
            </Dialog>
            <div className="emit-layout grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="emit-form min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
                <fieldset disabled={Boolean(emissionBusy)} className="min-w-0 space-y-4"><div className="emit-group-title"><span>1</span><h2>Dados da etiqueta</h2></div>
                <div className="grid gap-4 sm:grid-cols-2"><EmitField label="Cliente"><SystemSelect value={selectedClient} disabled={role === "operator" || role === "admin_cliente"} onChange={(e) => { setSelectedClient(e.target.value); setSelectedProduct(""); setSelectedResponsible(""); setLabelDraft(null); setLot(""); setShelfDays(""); }}><option value="">Selecione o cliente</option>{activeClients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SystemSelect></EmitField>
                <EmissionProductPicker key={selectedClient} clientId={selectedClient} value={selectedProduct} disabled={!selectedClient} revision={overviewRevision} onRecord={handleProductRecord} onChange={(selected) => { setSelectedProduct(selected?.id ?? ""); setProducts(selected ? [selected] : []); setLot(""); setLabelDraft(null); setShelfDays(selected ? String(shelfDaysFor(selected, storage)) : ""); }} />
                <EmitField label="Responsável"><SystemSelect value={selectedResponsible} disabled={!selectedClient} onChange={(e) => { setSelectedResponsible(e.target.value); try { window.localStorage.setItem(`tinutri.last-responsible.${selectedClient}`, e.target.value); } catch { /* Preferência local opcional. */ } }}><option value="">Selecione o responsável</option>{visibleCollaborators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SystemSelect></EmitField>
                <EmitField label="Tipo da etiqueta"><SystemSelect value={kind} onChange={(e) => setKind(e.target.value as LabelKind)}>{LABEL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</SystemSelect></EmitField></div>
                <div className="emit-group-title"><span>2</span><h2>Validade e conservação</h2></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmitField label="Data de manipulação/abertura"><input type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} /></EmitField>
                  <EmitField label="Hora"><input type="time" value={openedTime} onChange={(e) => setOpenedTime(e.target.value)} /></EmitField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmitField label="Validade após abertura (dias)" hint="Editável"><input type="number" min={0} max={3650} value={shelfDays} onChange={(e) => setShelfDays(e.target.value)} placeholder={product ? String(product.shelf_life_days) : "0"} /></EmitField>
                  <div className="emit-expiry rounded-xl border bg-secondary/40 p-4"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Validade calculada</span><strong className="mt-1 block text-xl text-primary">{expiresOn}</strong></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <EmitField label="Conservação">
                    <SystemSelect value={storage} onChange={(e) => { setStorage(e.target.value); if (product) setShelfDays(String(shelfDaysFor(product, e.target.value))); }}>
                      <option value="">Não informar</option>
                      {STORAGE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </SystemSelect>
                  </EmitField>
                  <EmitField label="Setor / local" hint="Opcional"><input maxLength={40} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ex.: Cozinha quente" /></EmitField>
                </div>
                {product?.requires_lot && <EmitField label="Número do lote" hint="Obrigatório para este produto"><input value={lot} maxLength={80} onChange={(e) => setLot(e.target.value)} placeholder="Ex.: 4587" /></EmitField>}
                {product?.requires_inspection && <div className="rounded-2xl border border-primary/20 bg-secondary p-4 text-sm"><ShieldCheck className="mr-2 inline size-5 text-primary" /><strong>{product.inspection_type}/registro:</strong> {product.inspection_number}</div>}
                <div className="emit-group-title"><span>3</span><h2>Quantidade e impressão</h2></div>
                <div><EmitField label="Quantidade de etiquetas" hint="1 a 200"><input type="number" min={1} max={200} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></EmitField><div className="mt-2 flex gap-2" role="group" aria-label="Quantidades rápidas">{[1,5,10].map(count => <button key={count} type="button" className="emit-count" aria-pressed={quantity === String(count)} onClick={() => setQuantity(String(count))}>{count} etiqueta{count === 1 ? "" : "s"}</button>)}</div></div>

                {product && responsible && !labelDraft && <Button variant="outline" className="w-full" onClick={() => setLabelDraft({ product: product.name, responsible: responsible.name, opened: openedOn, expires: format(expiresAtPreview, "yyyy-MM-dd"), lot })}><Pencil /> Editar etiqueta antes de imprimir</Button>}
                {labelDraft && <div className="grid gap-4 rounded-2xl border bg-secondary/50 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><EmitField label="Nome na etiqueta"><input maxLength={120} value={labelDraft.product} onChange={(e) => setLabelDraft({ ...labelDraft, product: e.target.value })} /></EmitField></div><EmitField label="Aberto em"><input type="date" value={labelDraft.opened} onChange={(e) => setLabelDraft({ ...labelDraft, opened: e.target.value })} /></EmitField><EmitField label="Validade"><input type="date" value={labelDraft.expires} onChange={(e) => setLabelDraft({ ...labelDraft, expires: e.target.value })} /></EmitField><EmitField label="Lote"><input maxLength={80} value={labelDraft.lot} onChange={(e) => setLabelDraft({ ...labelDraft, lot: e.target.value })} /></EmitField><EmitField label="Responsável"><input maxLength={120} value={labelDraft.responsible} onChange={(e) => setLabelDraft({ ...labelDraft, responsible: e.target.value })} /></EmitField><div className="sm:col-span-2"><Button variant="ghost" size="sm" onClick={() => setLabelDraft(null)}>Cancelar edição</Button></div></div>}
                </fieldset>
                {pendingPrint && (
                  <div role="alert" className="mt-5 rounded-2xl border border-primary/30 bg-secondary/50 p-4">
                    <strong className="block text-sm">A impressão saiu correta?</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pendingPrint.total} etiqueta(s) de {pendingPrint.product} aguardando confirmação. A saída só entra no controle de validades depois do seu “Sim”.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button className="dashboard-primary" disabled={Boolean(emissionBusy)} onClick={() => void performEmission("confirm", confirmPendingPrint)}><CheckCircle2 /> Sim, imprimiu certo</Button>
                      <Button variant="outline" disabled={Boolean(emissionBusy)} onClick={() => void performEmission("reject", rejectPendingPrint)}><AlertTriangle /> Não / deu erro</Button>
                    </div>
                  </div>
                )}
                {message && (
                  <div role={emissionError ? "alert" : "status"} className={`emit-feedback mt-4 flex flex-wrap items-center justify-between gap-2 ${emissionError ? "clients-error" : "clients-notice"}`}>
                    <span className="min-w-0 flex-1">{message}</span>
                    {lastFailedPrint && lastFailedPrint.length > 0 && (
                      <Button variant="kitchen" size="sm" disabled={Boolean(emissionBusy) || Boolean(pendingPrint)} onClick={() => void performEmission("retry", retryLastPrint)}><Printer /> Tentar novamente</Button>
                    )}
                  </div>
                )}
                <div className="emit-actions mt-5 grid gap-2 border-t pt-5 sm:grid-cols-2">
                  <Button variant="outline" className="min-h-12 w-full" disabled={!emissionReady || Boolean(emissionBusy)} onClick={() => void performEmission("add", addToQueue)}><ListPlus />{emissionBusy === "add" ? "Adicionando…" : "Adicionar à fila"}</Button>
                  <Button className="dashboard-primary min-h-12 w-full" disabled={!emissionReady || Boolean(emissionBusy) || Boolean(pendingPrint)} onClick={() => void performEmission("now", printNow)}><Printer />{emissionBusy === "now" ? "Preparando impressão…" : "Imprimir agora"}</Button>
                </div>
                <p role="status" className="mt-3 text-xs leading-relaxed text-muted-foreground">{pendingPrint ? "Confirme o resultado da impressão antes de enviar outras etiquetas." : emissionReady ? "Tudo pronto. Cada etiqueta terá seu próprio QR Code." : "Selecione cliente, produto e responsável e confira os campos obrigatórios."}</p>
              </div>
              <aside className="emit-preview-column min-w-0 space-y-4">
                <div className="emit-preview-card rounded-2xl border bg-card p-5">
                  <h2 className="text-sm font-semibold">Pré-visualização</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">{printerSettings.size.replace("x", " × ")} mm · Atualizada conforme o preenchimento</p><div className="emit-paper flex justify-center rounded-xl bg-muted/40 py-5">
                  <LabelPreview label={previewLabel} widthMm={sizeMm(printerSettings.size).w} heightMm={sizeMm(printerSettings.size).h} scale={printerSettings.size === "50x30" ? 0.78 : 1} />
                  </div>
                  {label && <p className="mt-3 text-xs text-muted-foreground">Última enviada: <strong className="font-medium">{label.product}</strong></p>}
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Fila de impressão</h2>
                    <span className="text-xs font-semibold text-muted-foreground">{queue.length} item(ns)</span>
                  </div>
                  {queue.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Adicione etiquetas à fila para imprimir várias de uma vez.</p>
                  ) : (
                    <ul className="emit-queue-list mt-3 space-y-2">
                      {queue.map((it) => (
                        <li key={it.id} className="flex items-center gap-2 rounded-xl border bg-secondary/40 p-2">
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-sm">{it.label.product}</strong>
                            <p className="truncate text-xs text-muted-foreground">VAL {it.label.expires} · {it.label.responsible}{it.label.lot ? ` · Lote ${it.label.lot}` : ""}</p>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={it.copies}
                            onChange={(e) => updateQueueCopies(it.id, Number(e.target.value))}
                            className="!w-16 !p-1 text-center text-sm"
                            disabled={Boolean(emissionBusy)} aria-label={`Cópias de ${it.label.product}`}
                          />
                          <Button variant="ghost" size="icon" aria-label={`Remover ${it.label.product} da fila`} disabled={Boolean(emissionBusy)} onClick={() => removeFromQueue(it.id)}><Trash2 /></Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button size="lg" className="dashboard-primary mt-3 w-full" disabled={queue.length === 0 || Boolean(emissionBusy) || Boolean(pendingPrint)} onClick={() => void performEmission("queue", printQueue)}>
                    <Printer />{emissionBusy === "queue" ? "Preparando lote…" : `Imprimir fila (${queue.reduce((sum, it) => sum + it.copies, 0)})`}
                  </Button>
                </div>
              </aside>
            </div>
          </section>}
          {tab === "clients" && <ClientsPanel scope={role === "admin_master" ? null : role === "nutricionista" ? carteira : profileClientId ? [profileClientId] : []} revision={overviewRevision} refresh={refresh} recordActivity={recordActivity} focusedId={focusedEntityId} />}
          {tab === "products" && <ProductsPanel clients={clients} scope={role === "admin_master" ? null : role === "nutricionista" ? carteira : profileClientId ? [profileClientId] : []} revision={overviewRevision} refresh={refresh} recordActivity={recordActivity} focusedId={focusedEntityId} initialClient={entryCompany} />}
          {tab === "team" && <TeamPanel scope={accessScope} clients={clients} collaborators={collaborators} refresh={refresh} recordActivity={recordActivity} focusedId={focusedEntityId} />}
          {tab === "validades" && <ValidadesPanel scope={overviewScope} revision={overviewRevision} alertDays={alertDays} onAlertDaysChange={updateAlertDays} onSettle={settleLabel} window={validityWindow} onWindowChange={setValidityWindow} clientName={clients.find((item) => item.id === dashboardClient)?.name ?? "Todas as empresas acessíveis"} onOpenLabel={(id) => { setDetailAction(null); setDetailLabelId(id); }} />}
          {tab === "acompanhamento" && (role === "admin_master" || role === "nutricionista") && <CarePanel scope={role === "admin_master" ? null : carteira} revision={overviewRevision} initialClient={entryCompany} focusedId={focusedEntityId} />}
          {tab === "history" && <HistoryPanel scope={entryCompany && (accessScope === null || accessScope.includes(entryCompany)) ? [entryCompany] : accessScope} revision={overviewRevision} onReprint={reprintLabel} onDuplicate={duplicateLabel} />}
        </main>
      </div>
    </div>
  );
}


function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className="flex min-w-0 items-center gap-2 sm:gap-3">
    <img src={tinutriLogo} alt="TiNutri" width={40} height={40} className="size-8 shrink-0 rounded-lg object-contain sm:size-10" loading="lazy" />
    <div className="min-w-0">
      <strong className={`block truncate font-display text-sm leading-tight sm:text-lg ${inverse ? "text-primary-foreground" : "text-foreground"}`}><span className="sm:hidden">TiNutri</span><span className="hidden sm:inline">TiNutri Smart Label®</span></strong>
      <span className={`block text-xs ${inverse ? "text-primary-foreground/65" : "text-muted-foreground"}`}><span className="sm:hidden">Smart Label®</span><span className="hidden sm:inline">Validade simples. Segurança sempre.</span></span>
    </div>
  </div>;
}

function EmitField({ label, hint, children }: { label: string; hint?: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="min-w-0"><div className="mb-2 flex flex-wrap justify-between gap-1 text-xs"><label htmlFor={id} className="font-medium">{label}</label>{hint && <span className="text-muted-foreground">{hint}</span>}</div>{cloneElement(children, { id })}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 flex justify-between text-sm font-bold">{label}{hint && <small className="font-medium text-muted-foreground">{hint}</small>}</span>{children}</label> }

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clientes", icon: Building2 },
  { id: "products", label: "Produtos", icon: PackagePlus },
  { id: "team", label: "Colaboradores", icon: Users },
  { id: "emit", label: "Emitir Etiquetas", icon: Printer },
  { id: "validades", label: "Validades (PVPS)", icon: CalendarClock },
  { id: "acompanhamento", label: "Acompanhamento", icon: ClipboardList },
  { id: "history", label: "Histórico", icon: History },
] as const;

const ROLE_TABS: Record<AppRole, AppTab[]> = {
  admin_master: ["dashboard", "clients", "products", "team", "emit", "validades", "history", "acompanhamento"],
  nutricionista: ["dashboard", "clients", "products", "team", "emit", "validades", "history", "acompanhamento"],
  admin_cliente: ["dashboard", "products", "team", "emit", "validades", "history"],
  gerente: ["dashboard", "products", "team", "emit", "validades", "history"],
  operator: ["dashboard", "emit", "validades", "history"],
};

function Nav({ role, tab, setTab, badges = {}, closeOnSelect = false }: { role: AppRole; tab: AppTab; setTab: (id: AppTab) => void; badges?: Partial<Record<AppTab, number>>; closeOnSelect?: boolean }) {
  const allowed = new Set<AppTab>(ROLE_TABS[role]);
  return navItems.filter((item) => allowed.has(item.id)).map((item) => {
    const control = <Button key={item.id} variant={tab === item.id ? "secondary" : "ghost"} className="workspace-nav-item h-11 w-full justify-start" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon />{item.label}{(badges[item.id] ?? 0) > 0 && <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground" aria-label={`${badges[item.id]} vencidas ou vencendo hoje`}>{badges[item.id]! > 99 ? "99+" : badges[item.id]}</span>}</Button>;
    return closeOnSelect ? <SheetClose asChild key={item.id}>{control}</SheetClose> : control;
  });
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin_master: "Admin Master TiNutri",
  nutricionista: "Nutricionista",
  admin_cliente: "Admin Cliente",
  gerente: "Gerente",
  operator: "Colaborador",
};

function WorkspaceActions({ role, preferences, closeOnSelect = false }: { role: AppRole; preferences: React.ReactNode; closeOnSelect?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      location.reload();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
      setPending(false);
    }
  };
  const master = <Button asChild variant="ghost" className="workspace-nav-item h-11 w-full justify-start"><Link to="/admin"><Building2 />Área Master</Link></Button>;
  return <div className="workspace-sidebar-actions mt-4 space-y-1 border-t pt-4">
    <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Preferências</p>
    {preferences}
    <div className="my-2 border-t" />
    {role === "admin_master" && (closeOnSelect ? <SheetClose asChild>{master}</SheetClose> : master)}
    <Button variant="ghost" className="workspace-nav-item h-11 w-full justify-start" disabled={pending} onClick={signOut}><LogOut />{pending ? "Saindo…" : "Sair"}</Button>
    {error && <p role="alert" className="px-3 pt-2 text-xs text-destructive">{error}</p>}
  </div>;
}

function UserStrip({ userName, role, clientName }: { userName: string; role: AppRole | null; clientName: string | null }) {
  if (!role) return null;
  return (
    <div className="workspace-user ml-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground" title={[userName, ROLE_LABEL[role], clientName].filter(Boolean).join(" · ")}>
      <span className="workspace-avatar shrink-0" aria-hidden="true">{(userName || "U").slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 text-right">
        <strong className="block truncate font-semibold text-foreground">{userName || "Sua conta"}</strong>
        <span className="block truncate text-[10px]">{ROLE_LABEL[role]}{clientName ? ` · ${clientName}` : ""}</span>
      </div>
    </div>
  );
}

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-muted-foreground">{description}</p></> }


function TeamPanel({ scope, clients, collaborators, refresh, recordActivity, focusedId }: { scope: string[] | null; clients: Client[]; collaborators: Collaborator[]; refresh: () => Promise<void>; recordActivity: ActivityRecorder; focusedId: string | null }) {
  const empty = { client_id: "", name: "", role_title: "", active: true };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const reset = () => { setForm(empty); setEditingId(null); setMsg(""); };
  const startEdit = useCallback((c: Collaborator) => { setEditingId(c.id); setForm({ client_id: c.client_id, name: c.name, role_title: c.role_title ?? "", active: c.active }); }, []);
  useFocusedEntity("collaborators", focusedId, scope, startEdit, setMsg);
  const filtered = collaborators.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.role_title ?? "").toLowerCase().includes(search.toLowerCase()));
  return <section><PanelHeader eyebrow="Equipe" title="Colaboradores" description="Cadastre os responsáveis que aparecerão nas etiquetas."/>
    <form className="mt-7 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-3 sm:items-end" onSubmit={async (e) => { e.preventDefault(); setMsg(""); const payload = { client_id: form.client_id, name: form.name.trim(), role_title: form.role_title.trim() || null, active: form.active }; const op = editingId ? supabase.from("collaborators").update(payload).eq("id", editingId).select("id").maybeSingle() : supabase.from("collaborators").insert(payload).select("id").single(); const { data: saved, error } = await op; if (error || !saved) { setMsg("Não foi possível salvar."); return; } await recordActivity(editingId ? "colaborador_atualizado" : "colaborador_criado", payload.client_id, "collaborator", saved.id, payload.name, editingId ? { ...collaborators.find((item) => item.id === editingId) } : {}, payload); reset(); await refresh(); }}>
      <Field label="Cliente"><SystemSelect required value={form.client_id} onChange={(e) => setForm(p => ({ ...p, client_id: e.target.value }))}><option value="">Selecione</option>{clients.filter(c => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SystemSelect></Field>
      <Field label="Nome"><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}/></Field>
      <Field label="Função"><input maxLength={80} value={form.role_title} onChange={(e) => setForm(p => ({ ...p, role_title: e.target.value }))} placeholder="Ex.: Cozinheira"/></Field>
      <label className="flex items-center gap-3 font-semibold sm:col-span-3"><input className="size-5 w-auto" type="checkbox" checked={form.active} onChange={(e) => setForm(p => ({ ...p, active: e.target.checked }))}/> Colaborador ativo</label>
      <div className="flex gap-3 sm:col-span-3"><Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar"}</Button>{editingId && <Button type="button" variant="ghost" onClick={reset}><X/> Cancelar</Button>}</div>
      {msg && <p className="text-sm text-muted-foreground sm:col-span-3">{msg}</p>}
    </form>
    <div className="mt-6 relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome ou função"/></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground sm:col-span-2">Nenhum colaborador encontrado.</p> : filtered.map((c) => <article key={c.id} className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-5"><div className="min-w-0"><Users className="text-primary"/><strong className="mt-3 block truncate">{c.name}</strong>{c.role_title && <p className="text-sm font-semibold text-primary">{c.role_title}</p>}<p className="text-xs text-muted-foreground">{clients.find((client) => client.id === c.client_id)?.name}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" aria-label="Editar" onClick={() => startEdit(c)}><Pencil className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="Inativar" onClick={async () => { if (!confirm("Inativar este colaborador?")) return; const { data: saved, error } = await supabase.from("collaborators").update({ active: false }).eq("id", c.id).select("id").maybeSingle(); if (error || !saved) { setMsg("Não foi possível inativar o colaborador."); return; } await recordActivity("colaborador_inativado", c.client_id, "collaborator", c.id, c.name, { active: c.active }, { active: false }); await refresh(); }}><Trash2 className="size-4 text-destructive"/></Button></div></article>)}</div>
  </section>;
}
