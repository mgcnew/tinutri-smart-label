/** Imprime um documento HTML em um frame invisível: no diálogo do navegador dá para "Salvar como PDF". */
export function printHtml(html: string) {
  document
    .querySelectorAll<HTMLIFrameElement>("iframe[data-tinutri-report]")
    .forEach((node) => node.remove());
  const frame = document.createElement("iframe");
  frame.setAttribute("data-tinutri-report", "1");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  frame.srcdoc = html;
}
