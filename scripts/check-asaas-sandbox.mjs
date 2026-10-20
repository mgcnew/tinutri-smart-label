// Somente leitura. Node.js carrega o .env sem expandir o $ da chave.
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Ambiente de hospedagem pode fornecer as variáveis. */
}
const { asaasWallet } = await import("../src/lib/contracting/asaas.server.ts");
try {
  await asaasWallet();
  console.log(
    "Asaas sandbox: autenticação e identificação da conta aprovadas. Nenhum cadastro ou cobrança criado.",
  );
} catch {
  console.error(
    "Asaas sandbox: não foi possível validar a configuração. Confira ASAAS_API_KEY e ASAAS_ENVIRONMENT sem compartilhar seus valores.",
  );
  process.exitCode = 1;
}
