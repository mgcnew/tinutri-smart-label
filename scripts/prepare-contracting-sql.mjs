import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Somente arquivos locais: não lê .env, não conecta ao banco e não executa SQL.
const source = new URL("../docs/sql/", import.meta.url);
const destination = new URL("../.output/sql-contratacao/", import.meta.url);
const migrations = [
  "22-contratacao-por-link.sql",
  "23-ativacao-contratacao.sql",
  "24-asaas-sandbox.sql",
  "25-fila-webhooks-asaas.sql",
];
const checks = ["00-conferir-contratacao.sql", "99-conferir-contratacao.sql"];
const hashes = {};
let combined = `-- GERADO por npm run sql:contracting. Não editar; alterar docs/sql e gerar novamente.
-- Requer o banco existente do TiNutri com SQL 15 e 19 aplicados.
-- Aplicar manualmente depois de ler docs/sql/README.md e executar a conferência 00.
-- Uma transação para os SQLs 22, 23, 24 e 25: qualquer erro impede a instalação parcial.
begin;
`;
for (const name of migrations) {
  const sql = await readFile(new URL(name, source), "utf8");
  // Recusa formatos diferentes em vez de remover transações silenciosamente.
  const match = sql.match(/^((?:\s*--[^\n]*\n)*\s*)begin;\s*([\s\S]*?)\s*commit;\s*$/i);
  if (!match || /^\s*(?:begin|commit|rollback)\s*;/im.test(match[2])) {
    throw new Error(`Revise as transações antes de consolidar ${name}.`);
  }
  hashes[name] = createHash("sha256").update(sql).digest("hex");
  combined += `\n-- Fonte: docs/sql/${name}\n-- SHA-256: ${hashes[name]}\n${match[1]}${match[2]}\n`;
}
combined += "\ncommit;\n";
await mkdir(destination, { recursive: true });
const installName = "01-instalar-contratacao.sql";
await writeFile(new URL(installName, destination), combined);
hashes[installName] = createHash("sha256").update(combined).digest("hex");
for (const name of checks) {
  const sql = await readFile(new URL(name, source), "utf8");
  await writeFile(new URL(name, destination), sql);
  hashes[name] = createHash("sha256").update(sql).digest("hex");
}
await writeFile(
  new URL("manifest.json", destination),
  JSON.stringify({ migrations, sha256: hashes }, null, 2) + "\n",
);
await writeFile(
  new URL("LEIA-ME.md", destination),
  await readFile(new URL("README.md", source), "utf8"),
);
console.log(`Pacote gerado em ${fileURLToPath(destination)}`);
console.log("Nenhuma conexão ou execução de SQL foi realizada.");
