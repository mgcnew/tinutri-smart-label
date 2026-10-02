export type ImportedProduct = {
  name: string;
  category: string;
  shelf_life_days: number;
  requires_lot: boolean;
  requires_inspection: boolean;
  inspection_type: "SIF" | "SISP" | "SIM" | null;
  inspection_number: string | null;
  notes: string | null;
};
export const PRODUCT_IMPORT_TEMPLATE =
  "\uFEFFproduto;categoria;validade_dias;exige_lote;tipo_inspecao;numero_inspecao;observacoes\r\nArroz cozido;Preparações;3;não;;;Manter refrigerado\r\n";

export function parseProductImport(source: string): ImportedProduct[] {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Aspas inválidas no CSV.");
      quoted = true;
    } else if (char === delimiter || char === "\n" || char === "\r") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (char !== delimiter) {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed && char.trim()) throw new Error("Conteúdo inválido após aspas no CSV.");
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error("O CSV contém aspas não fechadas.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.toLowerCase());
  if (!headers || !["produto", "categoria", "validade_dias"].every((key) => headers.includes(key)))
    throw new Error("Use o modelo: produto, categoria e validade_dias são obrigatórios.");
  const allowed = [
    "produto",
    "categoria",
    "validade_dias",
    "exige_lote",
    "tipo_inspecao",
    "numero_inspecao",
    "observacoes",
  ];
  if (new Set(headers).size !== headers.length || headers.some((key) => !allowed.includes(key)))
    throw new Error("O arquivo contém colunas repetidas ou desconhecidas. Use o modelo.");
  if (!rows.length || rows.length > 500)
    throw new Error("Importe entre 1 e 500 produtos por arquivo.");
  const names = new Set<string>();
  return rows.map((values, index) => {
    const fail = (message: string): never => {
      throw new Error(`Registro ${index + 1}: ${message}`);
    };
    if (values.length !== headers.length) fail("quantidade de colunas diferente do cabeçalho.");
    const get = (key: string) => values[headers.indexOf(key)] ?? "";
    const name = get("produto"),
      category = get("categoria"),
      days = get("validade_dias");
    if (name.length < 2 || name.length > 120) fail("produto deve ter de 2 a 120 caracteres.");
    if (category.length < 2 || category.length > 80)
      fail("categoria deve ter de 2 a 80 caracteres.");
    if (!/^\d+$/.test(days) || Number(days) > 3650)
      fail("validade deve ser um inteiro de 0 a 3650 dias.");
    const lot = get("exige_lote").toLowerCase();
    if (!["", "sim", "não", "nao", "true", "false", "1", "0"].includes(lot))
      fail("exige_lote deve ser sim ou não.");
    const inspection = get("tipo_inspecao").toUpperCase();
    const number = get("numero_inspecao");
    if (inspection && !["SIF", "SISP", "SIM"].includes(inspection))
      fail("inspeção deve ser SIF, SISP ou SIM.");
    if ((inspection && !number) || (!inspection && number) || number.length > 40)
      fail("confira o tipo e número de inspeção.");
    if (get("observacoes").length > 500) fail("observações devem ter até 500 caracteres.");
    const key = name.toLocaleLowerCase("pt-BR");
    if (names.has(key)) fail("produto repetido no arquivo.");
    names.add(key);
    return {
      name,
      category,
      shelf_life_days: Number(days),
      requires_lot: ["sim", "true", "1"].includes(lot),
      requires_inspection: Boolean(inspection),
      inspection_type: (inspection || null) as ImportedProduct["inspection_type"],
      inspection_number: number || null,
      notes: get("observacoes") || null,
    };
  });
}
