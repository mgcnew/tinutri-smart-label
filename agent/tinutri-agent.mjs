#!/usr/bin/env node
// Agente de impressão TiNutri. Uso: node tinutri-agent.mjs [caminho/do/config.json]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRpc, run } from "./agent-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(process.argv[2] ?? resolve(here, "config.json"));

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(`Não foi possível ler ${configPath}: ${error.message}`);
  console.error("Copie config.exemplo.json para config.json e preencha.");
  process.exit(1);
}
for (const key of ["supabaseUrl", "anonKey", "token"]) {
  if (!config[key]) {
    console.error(`config.json: falta "${key}".`);
    process.exit(1);
  }
}

const stamp = () => new Date().toLocaleString("pt-BR");
const log = (message) => console.log(`[${stamp()}] ${message}`);
const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    log("Encerrando agente…");
    controller.abort();
  });

log("Agente TiNutri iniciado. Aguardando etiquetas…");
await run({
  rpc: createRpc(config),
  log,
  pollMs: config.pollMs ?? 2000,
  policy: {
    allowedPorts: config.allowedPorts ?? [9100],
    allowPublic: config.allowPublicHosts === true,
  },
  signal: controller.signal,
});
