import tinutriLogo from "@/assets/tinutri-logo.png";
import { kindLabel, type PrintableLabel } from "@/lib/label";
import { bitmapToZpl, DOTS_PER_MM, labelDots, type ZplOptions } from "@/lib/zpl";

/** Desenho único da etiqueta: a mesma imagem alimenta a prévia, o navegador e a impressora ZPL. */

export type LayoutPreset = "padrao" | "validade_grande" | "compacto";

export type LayoutOptions = {
  showLogo: boolean;
  showQr: boolean;
  showStorage: boolean;
  showSector: boolean;
  showLot: boolean;
  showInspection: boolean;
  showResponsible: boolean;
  /** Texto do cabeçalho (vazio = sem cabeçalho). */
  brandText: string;
};

export type LabelLayout = {
  id: string;
  name: string;
  preset: LayoutPreset;
  options: LayoutOptions;
};

export const PRESETS: { id: LayoutPreset; label: string; hint: string }[] = [
  {
    id: "padrao",
    label: "Padrão",
    hint: "Equilíbrio entre produto, validade e dados de rastreio.",
  },
  {
    id: "validade_grande",
    label: "Validade em destaque",
    hint: "Data de validade bem grande para leitura rápida à distância.",
  },
  {
    id: "compacto",
    label: "Compacto",
    hint: "Menos espaço no topo e mais linhas de informação; bom para 50 × 30 mm.",
  },
];

export const DEFAULT_OPTIONS: LayoutOptions = {
  showLogo: true,
  showQr: true,
  showStorage: true,
  showSector: true,
  showLot: true,
  showInspection: true,
  showResponsible: true,
  brandText: "TiNutri Smart Label®",
};

export const BUILTIN_LAYOUTS: LabelLayout[] = [
  { id: "builtin:padrao", name: "Padrão", preset: "padrao", options: { ...DEFAULT_OPTIONS } },
  {
    id: "builtin:validade",
    name: "Validade em destaque",
    preset: "validade_grande",
    options: { ...DEFAULT_OPTIONS },
  },
  {
    id: "builtin:compacto",
    name: "Compacto",
    preset: "compacto",
    options: { ...DEFAULT_OPTIONS, showLogo: false },
  },
];

export function normalizeOptions(value: unknown): LayoutOptions {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const flag = (key: keyof LayoutOptions) =>
    typeof source[key] === "boolean" ? (source[key] as boolean) : (DEFAULT_OPTIONS[key] as boolean);
  const brand =
    typeof source.brandText === "string"
      ? source.brandText.slice(0, 40)
      : DEFAULT_OPTIONS.brandText;
  return {
    showLogo: flag("showLogo"),
    showQr: flag("showQr"),
    showStorage: flag("showStorage"),
    showSector: flag("showSector"),
    showLot: flag("showLot"),
    showInspection: flag("showInspection"),
    showResponsible: flag("showResponsible"),
    brandText: brand,
  };
}

export function normalizePreset(value: unknown): LayoutPreset {
  return value === "validade_grande" || value === "compacto" ? value : "padrao";
}

export type RenderSize = { widthMm: number; heightMm: number };

const FONT = "Arial, Helvetica, sans-serif";

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    // QR muda a cada etiqueta; guarda só o que é estável (logo).
    if (src.startsWith("data:")) return cached;
    imageCache.set(src, cached);
  }
  return cached;
}

type Metrics = {
  product: number;
  opened: number;
  validity: number;
  small: number;
  brand: number;
  kind: number;
};

function metricsFor(preset: LayoutPreset, s: number): Metrics {
  // Mínimo de 9 px (~1,1 mm) para o texto continuar legível no 50 × 30 mm.
  const f = (n: number) => Math.max(9, Math.round(n * s));
  if (preset === "validade_grande")
    return {
      product: f(22),
      opened: f(14),
      validity: f(40),
      small: f(11),
      brand: f(12),
      kind: f(11),
    };
  if (preset === "compacto")
    return {
      product: f(24),
      opened: f(14),
      validity: f(24),
      small: f(11),
      brand: f(12),
      kind: f(11),
    };
  return {
    product: f(26),
    opened: f(16),
    validity: f(28),
    small: f(11),
    brand: f(12),
    kind: f(11),
  };
}

/** Reduz a fonte até o texto caber na largura. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  size: number,
  maxWidth: number,
  min = 8,
) {
  let px = size;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && px > min) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

export async function renderLabelCanvas(
  label: PrintableLabel,
  size: RenderSize,
  layout: LabelLayout,
): Promise<HTMLCanvasElement> {
  const { width: W, height: H } = labelDots(size);
  const s = H / 320; // 60 × 40 mm é a referência de projeto
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");

  const { options: o, preset } = layout;
  const m = metricsFor(preset, s);
  const px = (n: number) => Math.round(n * s);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const wantLogo = o.showLogo;
  const [logo, qr] = await Promise.all([
    wantLogo
      ? loadImage(new URL(tinutriLogo, window.location.origin).toString())
      : Promise.resolve(null),
    o.showQr && label.qrDataUrl ? loadImage(label.qrDataUrl) : Promise.resolve(null),
  ]);

  const pad = px(10);
  const qrSize = qr ? px(preset === "compacto" ? 84 : 100) : 0;
  const gap = qr ? px(8) : 0;
  const colW = W - pad * 2 - (qr ? qrSize + gap : 0);
  let y = pad;

  // Cabeçalho
  const brand = o.brandText.trim();
  if (logo || brand) {
    const logoSize = logo ? px(22) : 0;
    if (logo) ctx.drawImage(logo, pad, y, logoSize, logoSize);
    if (brand) {
      ctx.font = `800 ${fit(ctx, brand, "800", m.brand, W - pad * 2 - logoSize - px(6))}px ${FONT}`;
      ctx.fillText(brand, pad + (logo ? logoSize + px(6) : 0), y + px(logo ? 6 : 2));
    }
    y += Math.max(logoSize, px(18)) + px(4);
  }

  // Tipo (tarja preta)
  const kindText = kindLabel(label.kind);
  ctx.font = `800 ${m.kind}px ${FONT}`;
  const kindH = px(20);
  const kindW = Math.min(W - pad * 2, ctx.measureText(kindText).width + px(12));
  ctx.fillRect(pad, y, kindW, kindH);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(kindText, pad + px(6), y + px(4));
  ctx.fillStyle = "#000000";
  y += kindH + px(6);

  // Produto (até 2 linhas, quebra por palavra)
  ctx.font = `900 ${m.product}px ${FONT}`;
  const lines: string[] = [];
  let current = "";
  for (const word of label.product.toUpperCase().split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > W - pad * 2 && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  const productLines = lines.slice(0, 2);
  if (lines.length > 2) {
    let last = productLines[1];
    while (ctx.measureText(`${last}…`).width > W - pad * 2 && last.length > 1)
      last = last.slice(0, -1);
    productLines[1] = `${last}…`;
  }
  for (const text of productLines) {
    ctx.fillText(text, pad, y);
    y += Math.round(m.product * 1.04);
  }
  y += px(4);

  // Abertura
  if (preset === "compacto") {
    ctx.font = `700 ${m.small}px ${FONT}`;
    ctx.fillText("ABERTURA:", pad, y);
    const labelW = ctx.measureText("ABERTURA: ").width;
    ctx.font = `700 ${fit(ctx, label.opened, "700", m.opened, colW - labelW)}px ${FONT}`;
    ctx.fillText(label.opened, pad + labelW, y - px(1));
    y += px(20);
  } else {
    ctx.font = `700 ${m.small}px ${FONT}`;
    ctx.fillText("MANIP./ABERTURA:", pad, y);
    ctx.font = `700 ${fit(ctx, label.opened, "700", m.opened, colW)}px ${FONT}`;
    ctx.fillText(label.opened, pad, y + px(13));
    y += px(34);
  }

  // Validade
  ctx.fillRect(pad, y, colW, Math.max(1, px(2)));
  y += px(5);
  ctx.font = `700 ${m.small}px ${FONT}`;
  ctx.fillText("VALIDADE:", pad, y);
  const validityPx = fit(ctx, label.expires, "900", m.validity, colW);
  ctx.font = `900 ${validityPx}px ${FONT}`;
  ctx.fillText(label.expires, pad, y + px(13));
  y += px(13) + Math.round(validityPx * 1.15) + px(4);

  // Metadados, em ordem de prioridade; o que não couber é omitido.
  const meta: string[] = [];
  // Alérgenos primeiro: é a informação de segurança que não pode ser a omitida quando faltar espaço.
  if (label.allergens) meta.push(`ALÉRGENOS: ${label.allergens.toUpperCase()}`);
  if (o.showStorage && label.storage) meta.push(`CONSERVAÇÃO: ${label.storage.toUpperCase()}`);
  if (o.showLot && label.lot) meta.push(`LOTE: ${label.lot.toUpperCase()}`);
  if (o.showInspection && label.inspection) meta.push(label.inspection.toUpperCase());
  if (o.showSector && label.sector) meta.push(`SETOR: ${label.sector.toUpperCase()}`);
  const responsible = o.showResponsible ? `RESP.: ${label.responsible.toUpperCase()}` : "";
  const lineH = Math.max(px(13), m.small + 2);
  const room = Math.floor((H - pad - y) / lineH);
  const reserve = responsible ? 1 : 0;
  const shown = meta.slice(0, Math.max(room - reserve, 0));
  if (responsible) shown.push(responsible);
  ctx.font = `700 ${m.small}px ${FONT}`;
  let metaY = H - pad - lineH * shown.length;
  for (const text of shown) {
    let t = text;
    while (ctx.measureText(t).width > colW && t.length > 4) t = t.slice(0, -1);
    ctx.fillText(t === text ? text : `${t.trimEnd()}…`, pad, metaY);
    metaY += lineH;
  }

  // QR de rastreio
  if (qr) {
    const qrY = H - pad - qrSize - px(11);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, W - pad - qrSize, qrY, qrSize, qrSize);
    ctx.font = `700 ${Math.max(8, px(9))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("RASTREIO", W - pad - qrSize / 2, H - pad - px(9));
    ctx.textAlign = "left";
  }

  return canvas;
}

export async function renderLabelPng(
  label: PrintableLabel,
  size: RenderSize,
  layout: LabelLayout,
): Promise<Blob | null> {
  const canvas = await renderLabelCanvas(label, size, layout);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

export async function renderLabelZpl(
  label: PrintableLabel,
  size: RenderSize,
  layout: LabelLayout,
  options?: ZplOptions,
): Promise<string> {
  const canvas = await renderLabelCanvas(label, size, layout);
  const { width, height } = labelDots(size);
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  return bitmapToZpl(data, size, options);
}

export { DOTS_PER_MM };
