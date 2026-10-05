import assert from "node:assert/strict";
import { test } from "node:test";

import { bitmapToZpl, calibrationZpl, labelDots, rgbaToBitmap } from "../src/lib/zpl.ts";

const SIZES = [
  { name: "60x40", size: { widthMm: 60, heightMm: 40 }, width: 480, height: 320 },
  { name: "50x30", size: { widthMm: 50, heightMm: 30 }, width: 400, height: 240 },
];

function blank(width: number, height: number, fill = 255) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([fill, fill, fill, 255], i);
  return rgba;
}

for (const { name, size, width, height } of SIZES) {
  test(`${name}: dimensões em pontos a 203 dpi`, () => {
    assert.deepEqual(labelDots(size), { width, height });
  });

  test(`${name}: ZPL declara largura, altura e bytes consistentes`, () => {
    const zpl = bitmapToZpl(blank(width, height), size, { copies: 3 });
    const total = (width / 8) * height;
    assert.match(zpl, new RegExp(`\\^PW${width}\\n\\^LL${height}`));
    assert.match(zpl, new RegExp(`\\^GFA,${total},${total},${width / 8},`));
    assert.match(zpl, /\^PQ3,0,1,N/);
    const hex = zpl.match(/\^GFA,\d+,\d+,\d+,([0-9A-F]+)\^FS/)![1];
    assert.equal(hex.length, total * 2);
    assert.match(zpl, /^\^XA\n/);
    assert.match(zpl, /\^XZ\n$/);
  });

  test(`${name}: etiqueta calibração tem moldura do tamanho exato`, () => {
    assert.match(calibrationZpl(size), new RegExp(`\\^GB${width},${height},3`));
  });
}

test("pixel preto vira bit 1 no byte e na posição certos", () => {
  const w = 16;
  const rgba = blank(w, 2);
  // (x=0,y=0) e (x=9,y=1)
  rgba.set([0, 0, 0, 255], 0);
  rgba.set([0, 0, 0, 255], (1 * w + 9) * 4);
  const { bytes, bytesPerRow } = rgbaToBitmap(rgba, w, 2);
  assert.equal(bytesPerRow, 2);
  assert.deepEqual(Array.from(bytes), [0x80, 0x00, 0x00, 0x40]);
});

test("largura que não é múltipla de 8 ganha byte de preenchimento", () => {
  const { bytesPerRow } = rgbaToBitmap(blank(10, 1), 10, 1);
  assert.equal(bytesPerRow, 2);
});

test("transparente é papel; cinza claro não imprime, escuro imprime", () => {
  const rgba = new Uint8ClampedArray([
    0, 0, 0, 0, 200, 200, 200, 255, 80, 80, 80, 255, 0, 0, 0, 255,
  ]);
  const { bytes } = rgbaToBitmap(rgba, 4, 1);
  assert.equal(bytes[0], 0b00110000);
});

test("bitmap de tamanho errado é recusado", () => {
  assert.throws(() => bitmapToZpl(blank(100, 100), SIZES[0].size), /esperado 153600/);
});

test("cópias ficam entre 1 e 999", () => {
  assert.match(bitmapToZpl(blank(480, 320), SIZES[0].size, { copies: 0 }), /\^PQ1,/);
  assert.match(bitmapToZpl(blank(480, 320), SIZES[0].size, { copies: 5000 }), /\^PQ999,/);
});
