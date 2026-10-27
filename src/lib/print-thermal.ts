import { buildPrintDocument, type PrintableLabel } from "@/lib/label";
import { sizeMm, type PrinterSettings } from "@/lib/printer-settings";

/** Imprime uma etiqueta física por item da lista, cada uma em sua própria página. */
export function printThermalBatch(labels: PrintableLabel[], settings: PrinterSettings): boolean {
  if (typeof window === "undefined" || labels.length === 0) return false;
  const { w, h } = sizeMm(settings.size);
  const scale = settings.size === "50x30" ? 0.78 : 1;
  const doc = buildPrintDocument(labels, w, h, scale);
  try {
    // Remove qualquer frame de impressão anterior para não acumular.
    document
      .querySelectorAll<HTMLIFrameElement>("iframe[data-tinutri-print]")
      .forEach((node) => node.remove());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-tinutri-print", "1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
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
