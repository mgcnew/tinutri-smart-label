/**
 * Geração de ZPL II para a Elgin L42 Pro (203 dpi = 8 pontos/mm).
 * A etiqueta é enviada como bitmap (^GF), idêntica ao que o app desenha,
 * sem depender de fontes ou acentos da impressora.
 */

export const DOTS_PER_MM = 8;

export type ZplLabelSize = { widthMm: number; heightMm: number };

export function labelDots(size: ZplLabelSize) {
  return {
    width: Math.round(size.widthMm * DOTS_PER_MM),
    height: Math.round(size.heightMm * DOTS_PER_MM),
  };
}

/** Converte pixels RGBA em bits (1 = preto), com a largura arredondada para bytes inteiros. */
export function rgbaToBitmap(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 160,
) {
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = rgba[i + 3] / 255;
      // Composição sobre branco: transparente = papel.
      const luma =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha);
      if (luma < threshold) bytes[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bytes, bytesPerRow };
}

function toHex(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i++)
    out += bytes[i].toString(16).padStart(2, "0").toUpperCase();
  return out;
}

export type ZplOptions = {
  /** Cópias idênticas (^PQ). */
  copies?: number;
  /** Escurecimento 0–30 (~MD). Omitido = mantém o da impressora. */
  darkness?: number;
  /** Velocidade 2–6 pol/s (^PR). Omitido = mantém o da impressora. */
  speed?: number;
};

/** ZPL de uma etiqueta bitmap. `rgba` deve ter exatamente width × height pixels. */
export function bitmapToZpl(
  rgba: Uint8ClampedArray | Uint8Array,
  size: ZplLabelSize,
  options: ZplOptions = {},
) {
  const { width, height } = labelDots(size);
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `Bitmap com ${rgba.length / 4} pixels; esperado ${width * height} (${width}×${height}).`,
    );
  }
  const copies = Math.min(Math.max(Math.trunc(options.copies ?? 1), 1), 999);
  const { bytes, bytesPerRow } = rgbaToBitmap(rgba, width, height);
  const total = bytes.length;
  const lines = ["^XA"];
  if (options.darkness !== undefined)
    lines.push(`~SD${Math.min(Math.max(Math.trunc(options.darkness), 0), 30)}`);
  if (options.speed !== undefined)
    lines.push(`^PR${Math.min(Math.max(Math.trunc(options.speed), 2), 6)}`);
  lines.push(
    "^LH0,0",
    `^PW${width}`,
    `^LL${height}`,
    "^PON",
    `^FO0,0^GFA,${total},${total},${bytesPerRow},${toHex(bytes)}^FS`,
    `^PQ${copies},0,1,N`,
    "^XZ",
  );
  return lines.join("\n") + "\n";
}

/** Várias etiquetas diferentes em um único envio. */
export function joinZpl(jobs: string[]) {
  return jobs.join("");
}

/**
 * Etiqueta de calibração: moldura nas bordas, cruz central e régua de 10 mm.
 * Serve para conferir tamanho, margens e alinhamento sem depender do layout real.
 */
export function calibrationZpl(size: ZplLabelSize) {
  const { width, height } = labelDots(size);
  const ticks: string[] = [];
  for (let x = DOTS_PER_MM * 10; x < width; x += DOTS_PER_MM * 10)
    ticks.push(`^FO${x},0^GB2,${DOTS_PER_MM * 3},2^FS`);
  return [
    "^XA",
    "^LH0,0",
    `^PW${width}`,
    `^LL${height}`,
    "^PON",
    `^FO0,0^GB${width},${height},3^FS`,
    `^FO${Math.round(width / 2)},0^GB1,${height},1^FS`,
    `^FO0,${Math.round(height / 2)}^GB${width},1,1^FS`,
    ...ticks,
    "^CI28",
    `^FO16,${DOTS_PER_MM * 4}^A0N,28,28^FD${size.widthMm} x ${size.heightMm} mm - ${width}x${height} pontos^FS`,
    `^FO16,${DOTS_PER_MM * 4 + 40}^A0N,28,28^FDAcentos: Ação Conservação Açúcar^FS`,
    "^XZ",
    "",
  ].join("\n");
}
