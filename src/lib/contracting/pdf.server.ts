import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** The exact frozen text is rendered; unsupported characters fail rather than disappear. */
export async function contractPdf(
  title: string,
  body: string,
  createdAt?: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  if (createdAt) {
    pdf.setCreationDate(new Date(createdAt));
    pdf.setModificationDate(new Date(createdAt));
  }
  pdf.setTitle(title);
  pdf.setAuthor("TiNutri Smart Label");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 785;
  const width = 483;
  const line = (text: string, heading = false) => {
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 785;
    }
    page.drawText(text, {
      x: 56,
      y,
      size: heading ? 13 : 10,
      font: heading ? bold : font,
      color: rgb(0.1, 0.17, 0.14),
    });
    y -= heading ? 22 : 15;
  };
  for (const [block, heading] of [
    [title, true],
    [body, false],
  ] as const) {
    for (const paragraph of block.split("\n")) {
      if (!paragraph) {
        y -= 10;
        continue;
      }
      let text = "";
      for (const word of paragraph.replace(/\t/g, "    ").split(" ")) {
        const candidate = text ? `${text} ${word}` : word;
        if ((heading ? bold : font).widthOfTextAtSize(candidate, heading ? 13 : 10) > width) {
          if (text) line(text, heading);
          // Break long references so an unbroken token cannot overflow the page.
          text = "";
          for (const char of word) {
            if ((heading ? bold : font).widthOfTextAtSize(text + char, heading ? 13 : 10) > width) {
              line(text, heading);
              text = "";
            }
            text += char;
          }
        } else text = candidate;
      }
      if (text) line(text, heading);
    }
    y -= 12;
  }
  pdf
    .getPages()
    .forEach((p, i, pages) =>
      p.drawText(`${i + 1} / ${pages.length}`, { x: 510, y: 32, size: 8, font }),
    );
  return pdf.save();
}
