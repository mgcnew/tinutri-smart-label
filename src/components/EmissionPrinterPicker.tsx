import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

import { SystemSelect } from "@/components/ui/system-select";
import { listPrinters, type NetworkPrinter } from "@/lib/print-queue";

/**
 * Na emissão só aparece quando há escolha a fazer: impressão em rede e mais de uma impressora na empresa.
 * O resto da configuração de impressão fica em Configurações > Impressão.
 */
export function EmissionPrinterPicker({
  clientId,
  connection,
  printerId,
  onSelect,
}: {
  clientId: string;
  connection: string;
  printerId: string;
  onSelect: (printerId: string) => void;
}) {
  const [printers, setPrinters] = useState<NetworkPrinter[]>([]);
  const active = connection === "wifi" && Boolean(clientId);

  useEffect(() => {
    setPrinters([]);
    if (!active) return;
    let alive = true;
    void listPrinters(clientId)
      .then((rows) => {
        if (alive) setPrinters(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active, clientId]);

  if (!active || printers.length < 2) return null;
  return (
    <div className="emit-printer flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <Printer className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <label htmlFor="emit-printer-select" className="text-sm font-medium">
        Imprimir em
      </label>
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <SystemSelect
          id="emit-printer-select"
          value={printerId}
          onChange={(event) => onSelect(event.target.value)}
        >
          {printers.map((printer) => (
            <option key={printer.id} value={printer.id}>
              {printer.name}
            </option>
          ))}
        </SystemSelect>
      </div>
    </div>
  );
}
