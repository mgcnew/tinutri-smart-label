// Retoma SOMENTE as cobranças fictícias já registradas. Não cria clientes/cobranças.
import { loadEnvFile } from "node:process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Variáveis do ambiente têm prioridade. */
}
const { asaasConfig, asaasWallet, asaasGetPayment, asaasRequest } =
  await import("../src/lib/contracting/asaas.server.ts");
const directory = new URL("../integration-state.local/", import.meta.url);
const destination = new URL("asaas-sandbox-validation.json", directory);
let report;
const save = async () => {
  await mkdir(directory, { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
};
try {
  asaasConfig();
  try {
    report = JSON.parse(await readFile(destination, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    report = JSON.parse(
      await readFile(new URL("../.output/asaas-sandbox-validation.json", import.meta.url), "utf8"),
    );
  }
  if (report.environment !== "sandbox" || !report.customer_id || !Array.isArray(report.payments))
    throw new Error("Relatório sandbox inválido.");
  const account = await asaasWallet();
  if (report.account_id && report.account_id !== account)
    throw new Error("A conta Asaas difere do ensaio original.");
  report.account_id = account;
  await save();
  for (const row of report.payments) {
    const before = await asaasGetPayment(row.payment_id);
    if (
      before.customer !== report.customer_id ||
      before.externalReference !== row.reference ||
      !row.reference?.startsWith("tinutri-test:") ||
      Math.abs(before.value * 100 - 5990) > 0.000001
    )
      throw new Error("A cobrança não corresponde ao ensaio fictício esperado.");
    const requested =
      (row.method === "boleto" && process.argv.includes("--confirm-boleto")) ||
      (row.method === "cartao" && process.argv.includes("--pay-test-card"));
    if (requested && ["PENDING", "OVERDUE"].includes(before.status)) {
      row.last_attempt_at = new Date().toISOString();
      row.last_attempt_kind = row.method === "boleto" ? "sandbox-confirm" : "sandbox-test-card";
      await save();
      try {
        if (row.method === "boleto")
          await asaasRequest(`/sandbox/payment/${before.id}/confirm`, "POST", {});
        else
          await asaasRequest(`/payments/${before.id}/payWithCreditCard`, "POST", {
            // Cartão fictício de aprovação da documentação oficial. Apenas sandbox.
            creditCard: {
              holderName: "TESTE SANDBOX",
              number: "4444444444444444",
              expiryMonth: "12",
              expiryYear: "2030",
              ccv: "123",
            },
            creditCardHolderInfo: {
              name: "TESTE SANDBOX",
              email: "tinutri-sandbox@example.com",
              cpfCnpj: "24971563792",
              postalCode: "89223005",
              addressNumber: "0",
              phone: "00000000000",
            },
            remoteIp: "203.0.113.10",
          });
        row.last_attempt_result = "response_received";
      } catch (error) {
        row.last_attempt_result =
          error.name === "ZodError" ? "Resposta incompatível." : error.message;
        process.exitCode = 1;
        console.error(`${row.method}: resposta inconclusiva, consultar estado sem repetir POST.`);
      }
    }
    const after = await asaasGetPayment(before.id);
    row.status = after.status;
    row.confirmed_by_simulation = ["RECEIVED", "CONFIRMED"].includes(after.status);
    await save();
    console.log(
      `${row.method}: ${after.status}${requested && before.status === after.status ? " (estado preservado)" : ""}.`,
    );
  }
  console.log(
    "Relatório atualizado em integration-state.local. Nenhum novo cadastro/cobrança ou alteração no Supabase.",
  );
} catch {
  console.error(
    "Não foi possível concluir a retomada. Confira conta, conexão e relatório local sem compartilhar segredos.",
  );
  process.exitCode = 1;
}
