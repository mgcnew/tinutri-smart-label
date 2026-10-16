// Configurações de impressão guardadas no navegador de cada aparelho.
export type PrinterType = "elgin";
export type ConnectionMode = "browser" | "wifi" | "bluetooth" | "usb";
export type LabelSize = "60x40" | "50x30";
export type PrinterSettings = {
  type: PrinterType;
  connection: ConnectionMode;
  ip: string;
  /** Impressora de rede cadastrada (modo Wi-Fi / IP): as etiquetas vão pela fila até o agente local. */
  printerId: string;
  size: LabelSize;
  showTime: boolean;
};

export const PRINTER_SETTINGS_KEY = "tinutri.printer-settings";
export const DEFAULT_SETTINGS: PrinterSettings = {
  type: "elgin",
  connection: "browser",
  ip: "",
  printerId: "",
  size: "60x40",
  showTime: true,
};

export const PRINTER_TYPES: { id: PrinterType; label: string }[] = [
  { id: "elgin", label: "Elgin L42 Pro" },
];
export const CONNECTION_MODES: { id: ConnectionMode; label: string }[] = [
  { id: "browser", label: "Impressão pelo navegador" },
  { id: "wifi", label: "Wi-Fi / IP" },
  { id: "bluetooth", label: "Bluetooth" },
  { id: "usb", label: "USB" },
];

export function loadSettings(): PrinterSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(PRINTER_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), type: "elgin" };
  } catch {
    /* Preferências locais são opcionais; os valores padrão continuam disponíveis. */
  }
  return DEFAULT_SETTINGS;
}

export function sizeMm(size: LabelSize) {
  return size === "50x30" ? { w: 50, h: 30 } : { w: 60, h: 40 };
}

export function saveSettings(settings: PrinterSettings) {
  try {
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Preferências locais são opcionais; os valores padrão continuam disponíveis. */
  }
}
