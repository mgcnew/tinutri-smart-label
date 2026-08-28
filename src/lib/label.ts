import { toDataURL } from "qrcode";

import tinutriLogo from "@/assets/tinutri-logo.png";

export type LabelKind = "manipulado" | "aberto" | "fracionado" | "recebido";
export type LabelLifecycle = "ativa" | "utilizada" | "consumida" | "descartada" | "cancelada";

export const LABEL_KINDS: { id: LabelKind; label: string; short: string }[] = [
  { id: "manipulado", label: "Produto manipulado", short: "PRODUTO MANIPULADO" },
  { id: "aberto", label: "Produto aberto", short: "PRODUTO ABERTO" },
  { id: "fracionado", label: "Produto fracionado", short: "PRODUTO FRACIONADO" },
  { id: "recebido", label: "Produto recebido", short: "PRODUTO RECEBIDO" },
];

export const STORAGE_PRESETS = [
  "REFRIGERADO ≤ 5 °C",
  "CONGELADO ≤ -18 °C",
  "RESFRIADO 6 °C A 10 °C",
  "TEMPERATURA AMBIENTE",
  "QUENTE ≥ 60 °C",
];

export function kindLabel(kind: LabelKind) {
  return LABEL_KINDS.find((k) => k.id === kind)?.short ?? "PRODUTO ABERTO";
}

/** Dados exatamente como serão impressos na etiqueta física. */
export type PrintableLabel = {
  kind: LabelKind;
  product: string;
  /** dd/MM/yyyy HH:mm */
  opened: string;
  /** dd/MM/yyyy HH:mm */
  expires: string;
  storage?: string;
  sector?: string;
  lot?: string;
  inspection?: string;
  responsible: string;
  issued: Date;
  /** identificador não sensível usado no QR Code */
  token?: string;
  qrDataUrl?: string;
};

export type LabelStatus = "no_prazo" | "proximo" | "vencido" | "utilizada" | "consumida" | "descartada" | "cancelada";

export const STATUS_TEXT: Record<LabelStatus, string> = {
  no_prazo: "NO PRAZO",
  proximo: "PRÓXIMO DO VENCIMENTO",
  vencido: "VENCIDO",
  utilizada: "UTILIZADO",
  consumida: "CONSUMIDO",
  descartada: "DESCARTADO",
  cancelada: "CANCELADO",
};

/** Status calculado a partir da validade registrada no banco. */
export function resolveStatus(lifecycle: LabelLifecycle, expiresAt: string | Date, now = new Date()): LabelStatus {
  if (lifecycle !== "ativa") return lifecycle;
  const expires = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const diffH = (expires.getTime() - now.getTime()) / 3_600_000;
  if (diffH <= 0) return "vencido";
  if (diffH <= 12) return "proximo";
  return "no_prazo";
}

export function labelUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/label/${token}`;
}

export function newLabelToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function qrFor(token: string) {
  return toDataURL(labelUrl(token), { width: 320, margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } });
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] ?? c);

export function labelStyles(w: number, h: number, scale: number) {
  const f = (pt: number) => +(pt * scale).toFixed(2);
  return `@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
body{font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:none;text-rendering:geometricPrecision}
.tl{width:${w}mm;height:${h}mm;padding:1.1mm 1.4mm;display:flex;flex-direction:column;background:#fff;color:#000;overflow:hidden;page-break-after:always;break-after:page}
.tl:last-child{page-break-after:auto;break-after:auto}
.tl__brand{display:flex;align-items:center;gap:.8mm;font-size:${f(5.2)}pt;font-weight:800;letter-spacing:.02em;line-height:1}
.tl__brand img{height:${f(3)}mm;width:${f(3)}mm;object-fit:contain}
.tl__kind{margin-top:.5mm;align-self:flex-start;background:#000;color:#fff;padding:.35mm 1.1mm;border-radius:.6mm;font-size:${f(4.8)}pt;font-weight:800;letter-spacing:.06em;line-height:1.2;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tl__product{margin-top:.7mm;font-size:${f(11)}pt;font-weight:900;line-height:1.02;text-transform:uppercase;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.tl__body{margin-top:.7mm;display:flex;gap:1.2mm;flex:1;min-height:0}
.tl__info{flex:1;min-width:0;display:flex;flex-direction:column}
.tl__k{font-size:${f(4.6)}pt;font-weight:700;letter-spacing:.06em;line-height:1.1}
.tl__v{font-size:${f(6.8)}pt;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
.tl__val{margin-top:.5mm;border-top:.25mm solid #000;padding-top:.5mm}
.tl__val strong{display:block;font-size:${f(11.5)}pt;font-weight:900;letter-spacing:-.02em;line-height:1.05;font-variant-numeric:tabular-nums}
.tl__meta{margin-top:auto;font-size:${f(4.9)}pt;font-weight:700;line-height:1.25;text-transform:uppercase}
.tl__meta div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl__qr{width:${f(12.5)}mm;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:.3mm}
.tl__qr img{width:${f(12.5)}mm;height:${f(12.5)}mm;display:block;image-rendering:pixelated}
.tl__qr span{font-size:${f(3.6)}pt;font-weight:700;letter-spacing:.04em}`;
}

/** Marcação da etiqueta — idêntica na pré-visualização e na impressão térmica. */
export function labelMarkup(label: PrintableLabel, logoUrl: string) {
  const line = (k: string, v: string) => `<div>${escapeHtml(k)} ${escapeHtml(v)}</div>`;
  const meta = [
    label.storage ? line("CONSERVAÇÃO:", label.storage.toUpperCase()) : "",
    label.lot ? line("LOTE:", label.lot.toUpperCase()) : "",
    label.sector ? line("SETOR:", label.sector.toUpperCase()) : "",
    label.inspection ? `<div>${escapeHtml(label.inspection.toUpperCase())}</div>` : "",
    line("RESP.:", label.responsible.toUpperCase()),
  ].join("");
  const qr = label.qrDataUrl
    ? `<div class="tl__qr"><img src="${label.qrDataUrl}" alt="QR Code da etiqueta"/><span>RASTREIO</span></div>`
    : "";
  return `<div class="tl">
  <div class="tl__brand"><img src="${logoUrl}" alt=""/><span>TiNutri Smart Label&reg;</span></div>
  <div class="tl__kind">${escapeHtml(kindLabel(label.kind))}</div>
  <div class="tl__product">${escapeHtml(label.product.toUpperCase())}</div>
  <div class="tl__body">
    <div class="tl__info">
      <div class="tl__k">MANIP./ABERTURA:</div>
      <div class="tl__v">${escapeHtml(label.opened)}</div>
      <div class="tl__val"><div class="tl__k">VALIDADE:</div><strong>${escapeHtml(label.expires)}</strong></div>
      <div class="tl__meta">${meta}</div>
    </div>
    ${qr}
  </div>
</div>`;
}

export function logoUrl() {
  return typeof window === "undefined" ? tinutriLogo : new URL(tinutriLogo, window.location.origin).toString();
}

/** Documento completo pronto para impressão térmica monocromática. */
export function buildPrintDocument(labels: PrintableLabel[], w: number, h: number, scale: number) {
  const logo = logoUrl();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas TiNutri ${w} × ${h} mm</title><style>${labelStyles(w, h, scale)}</style></head><body>${labels.map((l) => labelMarkup(l, logo)).join("")}</body></html>`;
}
