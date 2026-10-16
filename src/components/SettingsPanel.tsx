import { useEffect, useState, type ReactNode } from "react";
import {
  BellRing,
  CircleUser,
  Moon,
  Palette,
  Printer,
  Smartphone,
  Sun,
  Volume2,
} from "lucide-react";

import { usePush } from "@/components/AlertCenter";
import { NetworkPrinterSetup } from "@/components/NetworkPrinterSetup";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SystemSelect } from "@/components/ui/system-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import {
  CONNECTION_MODES,
  PRINTER_TYPES,
  type ConnectionMode,
  type LabelSize,
  type PrinterSettings,
} from "@/lib/printer-settings";

export type SettingsTab = "aparencia" | "alertas" | "impressao" | "conta";
export const SETTINGS_TABS: SettingsTab[] = ["aparencia", "alertas", "impressao", "conta"];

type ClientOption = { id: string; name: string };

type Props = {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  userId: string | null;
  userName: string;
  roleLabel: string;
  companyName: string | null;
  alertSound: ReturnType<typeof useAlertSound>;
  alertDays: number;
  onAlertDaysChange: (days: number) => void;
  printerSettings: PrinterSettings;
  onPrinterChange: (patch: Partial<PrinterSettings>) => void;
  /** Empresas disponíveis para vincular a impressora de rede; só aparece o seletor quando há mais de uma. */
  clients: ClientOption[];
  clientId: string;
  onClientChange: (id: string) => void;
  canManagePrinters: boolean;
  onTestPrint: () => void;
  testDisabled: boolean;
  feedback: { text: string; error: boolean } | null;
};

/** Linha com título, explicação e um interruptor; a linha inteira é o botão, para o toque ser fácil. */
function SwitchRow({
  icon,
  title,
  description,
  checked,
  onToggle,
  disabled,
  status,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  status?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-16 w-full items-center gap-3 border-b px-1 py-3 text-left last:border-b-0 disabled:opacity-60"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      {status && (
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{status}</span>
      )}
      <Switch
        checked={checked}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none shrink-0"
      />
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 flex flex-wrap justify-between gap-1 text-xs">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function AppearanceTab() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <Section
      title="Tema"
      description="Vale só para este aparelho. No primeiro acesso, segue o tema do seu sistema."
    >
      <SwitchRow
        icon={dark ? <Moon /> : <Sun />}
        title="Modo noturno"
        description="Fundo escuro, mais confortável em ambientes com pouca luz e na cozinha à noite."
        checked={dark}
        onToggle={toggle}
      />
    </Section>
  );
}

function AlertsTab({
  userId,
  alertSound,
  alertDays,
  onAlertDaysChange,
}: Pick<Props, "userId" | "alertSound" | "alertDays" | "onAlertDaysChange">) {
  const push = usePush(userId);
  return (
    <div className="space-y-5">
      <Section
        title="Avisos de validade"
        description="Escolha como ser avisado de etiquetas vencidas, que vencem hoje ou estão perto de vencer. Estas opções valem para este aparelho."
      >
        {push.state && (
          <>
            <SwitchRow
              icon={<Smartphone />}
              title="Notificações no celular ou computador"
              description="Chegam mesmo com o app fechado, em um resumo único (ex.: “2 etiquetas vencidas — Presunto, Queijo +1”)."
              checked={push.state === "on"}
              disabled={push.busy || Boolean(push.hint) || !userId}
              status={push.hint ? "Indisponível" : undefined}
              onToggle={() => void push.toggle()}
            />
            {push.hint && (
              <p role="status" className="px-1 pb-3 text-xs leading-relaxed text-muted-foreground">
                {push.hint}
              </p>
            )}
            {push.error && (
              <p role="alert" className="px-1 pb-3 text-xs text-destructive">
                {push.error}
              </p>
            )}
          </>
        )}
        <SwitchRow
          icon={alertSound.enabled && alertSound.blocked ? <BellRing /> : <Volume2 />}
          title="Som dos alertas"
          description="Toca com o app aberto e mantém a tela acesa para você não perder um aviso importante."
          checked={alertSound.enabled && !alertSound.blocked}
          status={
            alertSound.enabled && alertSound.blocked ? "Bloqueado: toque para reativar" : undefined
          }
          onToggle={() =>
            alertSound.enabled && !alertSound.blocked
              ? alertSound.disable()
              : void alertSound.enable()
          }
        />
      </Section>
      <Section
        title="Antecedência"
        description="Define a faixa “próximo de vencer” nas telas de validades e no cartão de alertas."
      >
        <FieldBlock label="Avisar com quantos dias de antecedência" hint="1 a 90 dias">
          <input
            type="number"
            min={1}
            max={90}
            value={alertDays}
            onChange={(event) => onAlertDaysChange(Number(event.target.value))}
            className="sm:max-w-40"
          />
        </FieldBlock>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          As notificações no celular sempre avisam com 3 dias; esta configuração vale só para as
          telas do sistema.
        </p>
      </Section>
    </div>
  );
}

function PrintingTab(
  props: Pick<
    Props,
    | "printerSettings"
    | "onPrinterChange"
    | "clients"
    | "clientId"
    | "onClientChange"
    | "canManagePrinters"
    | "onTestPrint"
    | "testDisabled"
    | "feedback"
  >,
) {
  const {
    printerSettings,
    onPrinterChange,
    clients,
    clientId,
    onClientChange,
    canManagePrinters,
    onTestPrint,
    testDisabled,
    feedback,
  } = props;
  const size = printerSettings.size.replace("x", " × ");
  const client = clients.find((item) => item.id === clientId);
  return (
    <div className="space-y-5">
      <Section
        title="Impressora"
        description="As alterações são salvas automaticamente neste navegador."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock label="Impressora">
            <input value={PRINTER_TYPES[0].label} readOnly aria-readonly="true" />
          </FieldBlock>
          <FieldBlock label="Modo de conexão">
            <SystemSelect
              value={printerSettings.connection}
              onChange={(event) =>
                onPrinterChange({ connection: event.target.value as ConnectionMode })
              }
            >
              {CONNECTION_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </SystemSelect>
          </FieldBlock>
          {printerSettings.connection === "wifi" && (
            <div className="space-y-4 sm:col-span-2">
              {clients.length > 1 && (
                <FieldBlock
                  label="Empresa da impressora"
                  hint="A impressora de rede pertence a uma empresa"
                >
                  <SystemSelect
                    value={clientId}
                    onChange={(event) => onClientChange(event.target.value)}
                  >
                    <option value="">Selecione a empresa</option>
                    {clients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </SystemSelect>
                </FieldBlock>
              )}
              <NetworkPrinterSetup
                clientId={clientId || null}
                clientName={client?.name}
                canManage={canManagePrinters}
                printerId={printerSettings.printerId}
                onSelect={(printerId) => onPrinterChange({ printerId })}
              />
            </div>
          )}
          <FieldBlock label="Tamanho da etiqueta">
            <SystemSelect
              value={printerSettings.size}
              onChange={(event) => onPrinterChange({ size: event.target.value as LabelSize })}
            >
              <option value="60x40">60 mm × 40 mm (padrão)</option>
              <option value="50x30">50 mm × 30 mm (opcional)</option>
            </SystemSelect>
          </FieldBlock>
        </div>
        <p className="mt-4 rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground">
          A etiqueta imprime data e hora de manipulação/abertura e de validade, além do QR Code
          individual de rastreio.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={testDisabled} onClick={onTestPrint}>
            <Printer /> Imprimir 1 etiqueta de teste
          </Button>
        </div>
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={`${feedback.error ? "clients-error" : "clients-notice"} mt-4`}
          >
            {feedback.text}
          </p>
        )}
      </Section>
      <Section title="Orientações" description="Elgin L42 Pro e impressão pelo computador.">
        <div className="space-y-3 text-xs leading-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">Elgin L42 Pro Full (USB no computador).</strong> Na
            janela de impressão que abrir, escolha a <strong>Elgin L42</strong>, deixe as margens em
            zero e a escala em 100% (sem “ajustar à página”). A etiqueta já sai no tamanho exato de{" "}
            {size} mm.
          </p>
          <p>
            No driver ou no utilitário da Elgin, no computador, selecione{" "}
            <strong>Térmica direta (sem ribbon)</strong> e o papel {size} mm. Essa configuração é da
            impressora: o site não consegue alterá-la sozinho.
          </p>
          <p className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" />
            No iPhone você cria e consulta etiquetas normalmente. Imprimir direto na Elgin pelo
            celular exige uma integração compatível, que ainda não está disponível aqui. Prepare no
            celular e imprima pelo computador ligado à impressora.
          </p>
        </div>
      </Section>
    </div>
  );
}

function AccountTab({
  userName,
  roleLabel,
  companyName,
}: Pick<Props, "userName" | "roleLabel" | "companyName">) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);

  const resetPassword = async () => {
    if (!email || pending) return;
    setPending(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    setMessage(
      error
        ? { text: "Não foi possível enviar o e-mail. Tente novamente em instantes.", error: true }
        : {
            text: `Enviamos o link para ${email}. Abra o e-mail para criar uma nova senha.`,
            error: false,
          },
    );
  };

  const rows: [string, string][] = [
    ["Nome", userName || "Sua conta"],
    ["E-mail", email || "—"],
    ["Perfil", roleLabel],
    ...(companyName ? ([["Empresa", companyName]] as [string, string][]) : []),
  ];
  return (
    <div className="space-y-5">
      <Section title="Seus dados">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {rows.map(([term, value]) => (
            <div key={term} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd className="mt-1 break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section
        title="Senha"
        description="Enviamos um link seguro para o seu e-mail, onde você cria uma nova senha."
      >
        <Button variant="outline" disabled={!email || pending} onClick={() => void resetPassword()}>
          {pending ? "Enviando…" : "Enviar link para redefinir a senha"}
        </Button>
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`${message.error ? "clients-error" : "clients-notice"} mt-4`}
          >
            {message.text}
          </p>
        )}
      </Section>
    </div>
  );
}

const TAB_META: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "aparencia", label: "Aparência", icon: <Palette /> },
  { id: "alertas", label: "Alertas", icon: <BellRing /> },
  { id: "impressao", label: "Impressão", icon: <Printer /> },
  { id: "conta", label: "Conta", icon: <CircleUser /> },
];

export function SettingsPanel(props: Props) {
  const { tab, onTabChange } = props;
  return (
    <section className="settings-page space-y-6">
      <header className="dashboard-heading">
        <div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Configurações</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tema, alertas, impressora e conta, organizados por assunto.
          </p>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SettingsTab)}>
        <TabsList className="thin-scroll h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:w-auto">
          {TAB_META.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="min-h-11 gap-2 px-4 [&_svg]:size-4 [&_svg]:shrink-0"
            >
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-5 max-w-3xl">
          <TabsContent value="aparencia" className="mt-0">
            <AppearanceTab />
          </TabsContent>
          <TabsContent value="alertas" className="mt-0">
            <AlertsTab
              userId={props.userId}
              alertSound={props.alertSound}
              alertDays={props.alertDays}
              onAlertDaysChange={props.onAlertDaysChange}
            />
          </TabsContent>
          <TabsContent value="impressao" className="mt-0">
            <PrintingTab
              printerSettings={props.printerSettings}
              onPrinterChange={props.onPrinterChange}
              clients={props.clients}
              clientId={props.clientId}
              onClientChange={props.onClientChange}
              canManagePrinters={props.canManagePrinters}
              onTestPrint={props.onTestPrint}
              testDisabled={props.testDisabled}
              feedback={props.feedback}
            />
          </TabsContent>
          <TabsContent value="conta" className="mt-0">
            <AccountTab
              userName={props.userName}
              roleLabel={props.roleLabel}
              companyName={props.companyName}
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
