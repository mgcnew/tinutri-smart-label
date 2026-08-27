import { useMemo } from "react";

import { labelMarkup, labelStyles, logoUrl, type PrintableLabel } from "@/lib/label";

/**
 * Pré-visualização fiel: usa exatamente a mesma marcação e o mesmo CSS da impressão,
 * isolada em um iframe com o tamanho físico real da etiqueta.
 */
export function LabelPreview({ label, widthMm, heightMm, scale = 1 }: { label: PrintableLabel; widthMm: number; heightMm: number; scale?: number }) {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${labelStyles(widthMm, heightMm, scale)}html,body{overflow:hidden}.tl{border:0}</style></head><body>${labelMarkup(label, logoUrl())}</body></html>`,
    [label, widthMm, heightMm, scale],
  );

  return (
    <div className="inline-block overflow-hidden rounded-lg border-2 border-dashed border-border bg-white shadow-sm">
      <iframe
        title={`Pré-visualização da etiqueta ${widthMm} × ${heightMm} mm`}
        srcDoc={srcDoc}
        scrolling="no"
        className="block border-0 bg-white"
        style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }}
      />
    </div>
  );
}
