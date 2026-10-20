import { loadEnvFile } from "node:process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Segredos podem vir da hospedagem. */
}
const { setupAsaasWebhook } = await import("../src/lib/contracting/asaas-setup.server.ts");
const destination = new URL("../integration-state.local/asaas-webhook.json", import.meta.url);
let saved = null;
try {
  saved = JSON.parse(await readFile(destination, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error("Revise o registro local do webhook antes de continuar.");
}
try {
  const result = await setupAsaasWebhook(
    {
      url: process.env.ASAAS_WEBHOOK_URL || "",
      email: process.env.ASAAS_WEBHOOK_EMAIL || "",
      token: process.env.ASAAS_WEBHOOK_TOKEN || "",
    },
    saved,
    process.argv.includes("--apply"),
  );
  if (result.state === "configured") {
    await mkdir(new URL("../integration-state.local/", import.meta.url), { recursive: true });
    await writeFile(
      destination,
      JSON.stringify(
        {
          account: result.account,
          id: result.id,
          url: result.url,
          configured_at: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Webhook sandbox configurado. Identificador preservado localmente; nenhum segredo exibido.",
    );
  } else {
    console.log(
      `Prévia: ${result.action === "create" ? "criar" : "atualizar"} webhook sandbox. Nenhuma configuração alterada. Use --apply depois de revisar a URL e o e-mail no .env.`,
    );
  }
} catch (error) {
  console.error(
    error.name === "ZodError"
      ? "Preencha ASAAS_WEBHOOK_URL, ASAAS_WEBHOOK_EMAIL e ASAAS_WEBHOOK_TOKEN com valores válidos."
      : error.message,
  );
  console.error(
    "Não houve repetição automática. Em falha inconclusiva, conferir os webhooks na conta antes de executar novamente.",
  );
  process.exitCode = 1;
}
