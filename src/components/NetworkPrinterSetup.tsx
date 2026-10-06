import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Plus, Trash2, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SystemSelect } from "@/components/ui/system-select";
import {
  addPrinter,
  createAgent,
  isAgentOnline,
  listAgents,
  listPrinters,
  removeAgent,
  removePrinter,
  type NetworkPrinter,
  type PrintAgent,
} from "@/lib/print-queue";

type Props = {
  clientId: string | null;
  clientName?: string;
  /** Operador só escolhe; cadastro de impressora e agente é de quem gerencia a empresa. */
  canManage: boolean;
  printerId: string;
  onSelect: (printerId: string) => void;
};

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";

export function NetworkPrinterSetup({
  clientId,
  clientName,
  canManage,
  printerId,
  onSelect,
}: Props) {
  const [printers, setPrinters] = useState<NetworkPrinter[]>([]);
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "Elgin L42 Pro", host: "", port: "9100" });
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) {
      setPrinters([]);
      setAgents([]);
      return;
    }
    try {
      const [p, a] = await Promise.all([listPrinters(clientId), listAgents(clientId)]);
      setPrinters(p);
      setAgents(a);
      setError("");
      if (p.length > 0 && !p.some((x) => x.id === printerId)) onSelect(p[0].id);
    } catch {
      setError("Não foi possível carregar as impressoras. Tente novamente.");
    }
  }, [clientId, printerId, onSelect]);

  useEffect(() => {
    void load();
  }, [load]);
  // Reflete o batimento do agente sem o usuário precisar reabrir a janela.
  useEffect(() => {
    if (!clientId) return;
    const timer = setInterval(() => {
      void listAgents(clientId)
        .then(setAgents)
        .catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [clientId]);

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  if (!clientId) {
    return (
      <p className="rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground sm:col-span-2">
        Selecione a empresa na emissão para configurar a impressora de rede.
      </p>
    );
  }

  const online = agents.some((a) => isAgentOnline(a));
  const portNumber = Number(form.port);
  const formValid =
    form.name.trim().length >= 2 &&
    /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(form.host.trim()) &&
    Number.isInteger(portNumber) &&
    portNumber > 0 &&
    portNumber <= 65535;

  return (
    <div className="space-y-4 sm:col-span-2">
      <p className="text-xs text-muted-foreground">
        Impressora de rede de <strong>{clientName ?? "esta empresa"}</strong>. As etiquetas vão para
        a fila e um programa no computador do local entrega à impressora.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 rounded-xl border p-3 text-sm">
        {online ? (
          <Wifi className="size-4 text-primary" />
        ) : (
          <WifiOff className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium">
          {online ? "Agente de impressão conectado" : "Agente de impressão desligado"}
        </span>
        {!online && agents.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Abra o programa no computador da impressora.
          </span>
        )}
      </div>

      {printers.length > 0 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Impressora usada nas etiquetas</span>
          <SystemSelect value={printerId} onChange={(e) => onSelect(e.target.value)}>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.host}:{p.port}
              </option>
            ))}
          </SystemSelect>
        </label>
      ) : (
        <p className="rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground">
          Nenhuma impressora de rede cadastrada para esta empresa.
          {canManage ? "" : " Peça a um gerente para cadastrar."}
        </p>
      )}

      {canManage && (
        <>
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-semibold">Cadastrar impressora</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
              <input
                className={field}
                aria-label="Nome da impressora"
                placeholder="Nome"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className={field}
                aria-label="IP da impressora"
                placeholder="192.168.1.200"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
              <input
                className={field}
                aria-label="Porta"
                inputMode="numeric"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !formValid}
                onClick={() =>
                  void run(async () => {
                    const created = await addPrinter(clientId, form.name, form.host, portNumber);
                    setForm({ ...form, host: "" });
                    await load();
                    onSelect(created.id);
                  }, "Não foi possível cadastrar a impressora. Confira o IP e a porta.")
                }
              >
                <Plus />
                Cadastrar
              </Button>
              {printerId && printers.some((p) => p.id === printerId) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await removePrinter(printerId);
                      onSelect("");
                      await load();
                    }, "Não foi possível remover a impressora.")
                  }
                >
                  <Trash2 />
                  Remover selecionada
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <p className="mb-1 text-sm font-semibold">Agente de impressão</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Gere o token, cole em <code>agent/config.json</code> e rode{" "}
              <code>node agent/tinutri-agent.mjs</code> no computador ligado à rede da impressora.
            </p>
            {agents.map((a) => (
              <div key={a.id} className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span>
                  {a.name} ·{" "}
                  {isAgentOnline(a)
                    ? "conectado"
                    : a.last_seen_at
                      ? `visto em ${new Date(a.last_seen_at).toLocaleString("pt-BR")}`
                      : "nunca conectou"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remover agente ${a.name}`}
                  onClick={() =>
                    void run(async () => {
                      await removeAgent(a.id);
                      await load();
                    }, "Não foi possível remover o agente.")
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setNewToken(await createAgent(clientId, `Agente ${agents.length + 1}`));
                  setCopied(false);
                  await load();
                }, "Não foi possível gerar o token do agente.")
              }
            >
              <Plus />
              Gerar token de agente
            </Button>
            {newToken && (
              <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-xs font-medium">
                  Copie agora: o token não será mostrado novamente.
                </p>
                <code className="mt-1 block break-all text-xs">{newToken}</code>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(newToken).then(() => setCopied(true));
                  }}
                >
                  {copied ? <CheckCircle2 /> : <Copy />}
                  {copied ? "Copiado" : "Copiar token"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
