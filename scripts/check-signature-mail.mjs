// Verifica conexão/autenticação SMTP; não envia mensagens nem lê a caixa postal.
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* ambiente hospedado */
}
try {
  const { ownKeys } = await import("../src/lib/contracting/own-crypto.server.ts");
  ownKeys();
  const { ownMailTransport } = await import("../src/lib/contracting/own-mail.server.ts");
  const transport = ownMailTransport();
  try {
    await transport.verify();
    console.log(
      "Conexão SMTP e autenticação conferidas. Nenhuma mensagem enviada. Isso ainda não comprova entrega na caixa de entrada.",
    );
  } finally {
    transport.close();
  }
} catch {
  console.error(
    "SMTP ainda não conferido. Verifique as chaves locais, remetente, verificação em duas etapas e senha de app do Gmail. Nenhum segredo foi exibido.",
  );
  process.exitCode = 1;
}
