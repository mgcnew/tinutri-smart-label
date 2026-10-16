import { Download, Printer, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

import { Button } from "@/components/ui/button";

/**
 * QR Code exclusivo do estabelecimento.
 * Contém APENAS o link público com um código aleatório (public_code).
 * Nunca inclui CNPJ, e-mail, senha ou qualquer dado sensível.
 */
export function ClientQrCard({ clientName, publicCode }: { clientName: string; publicCode: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>("");
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/e/${publicCode}`;

  useEffect(() => {
    if (!open || !url) return;
    void toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setDataUrl);
  }, [open, url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qrcode-${clientName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    a.click();
  };

  const print = () => {
    if (!dataUrl) return;
    document.querySelectorAll<HTMLIFrameElement>("iframe[data-tinutri-qr]").forEach((n) => n.remove());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-tinutri-qr", "1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
    document.body.appendChild(iframe);
    iframe.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR Code</title><style>body{font-family:Arial,Helvetica,sans-serif;text-align:center;padding:24px}img{width:70mm;height:70mm}h1{font-size:18pt;margin:12px 0 4px}p{font-size:10pt;color:#333;margin:0}</style></head><body><img src="${dataUrl}" alt="QR Code"><h1>${clientName.replace(/</g, "&lt;")}</h1><p>TiNutri Smart Label&reg;</p></body></html>`;
    iframe.onload = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* preserva a sessão */ }
      window.setTimeout(() => iframe.remove(), 4000);
    };
  };

  return (
    <div className="mt-3 rounded-xl border bg-muted/40 p-3">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        <QrCode className="size-4" /> {open ? "Ocultar QR Code" : "Visualizar QR Code"}
      </Button>
      {open && (
        <div className="mt-3 flex flex-col items-center gap-3">
          {dataUrl ? <img src={dataUrl} alt={`QR Code de ${clientName}`} className="size-40 rounded-lg bg-white p-2" /> : <p className="text-sm text-muted-foreground">Gerando…</p>}
          <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={download}><Download className="size-4" /> Baixar</Button>
            <Button type="button" variant="outline" size="sm" onClick={print}><Printer className="size-4" /> Imprimir</Button>
          </div>
        </div>
      )}
    </div>
  );
}
