// Somente leitura. Node.js carrega o .env sem expandir o $ da chave.
// Uso: npm run asaas:check            (sandbox)
//      npm run asaas:check -- --production
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Ambiente de hospedagem pode fornecer as variáveis. */
}
const environment = process.argv.includes("--production") ? "production" : "sandbox";
const label = environment === "production" ? "Asaas produção" : "Asaas sandbox";
const { asaasWallet, asaasWebhookReady } = await import("../src/lib/contracting/asaas.server.ts");
try {
  await asaasWallet(environment);
  console.log(
    `${label}: autenticação e identificação da conta aprovadas. Nenhum cadastro ou cobrança criado.`,
  );
  if (!asaasWebhookReady(environment))
    console.log(
      `${label}: o token do webhook ainda precisa ser configurado (32+ caracteres, próprio deste ambiente).`,
    );
} catch {
  console.error(
    environment === "production"
      ? `${label}: não foi possível validar. Confira ASAAS_PRODUCTION_ENABLED e ASAAS_PRODUCTION_API_KEY sem compartilhar seus valores.`
      : `${label}: não foi possível validar a configuração. Confira ASAAS_API_KEY e ASAAS_ENVIRONMENT sem compartilhar seus valores.`,
  );
  process.exitCode = 1;
}
