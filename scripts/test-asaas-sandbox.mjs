// Ensaio externo explícito: cria registros FICTÍCIOS apenas no sandbox, sem notificações.
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
try {
  loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* Pode usar segredos do ambiente. */
}
if (!process.argv.includes("--create-test-payments")) {
  console.error(
    "Para criar faturas fictícias no sandbox, execute com --create-test-payments. Para somente leitura, use npm run asaas:check.",
  );
  process.exit(1);
}
const {
  asaasConfig,
  asaasWallet,
  asaasCustomer,
  asaasCreatePayment,
  asaasGetPayment,
  asaasRequest,
} = await import("../src/lib/contracting/asaas.server.ts");
asaasConfig(); // Recusa produção antes de qualquer chamada, inclusive se mudar o .env.
const report = {
  environment: "sandbox",
  created_at: new Date().toISOString(),
  customer_id: null,
  payments: [],
};
const destination = new URL(
  "../integration-state.local/asaas-sandbox-validation.json",
  import.meta.url,
);
const save = async () => {
  await mkdir(new URL("../integration-state.local/", import.meta.url), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
};
try {
  for (const previous of [
    destination,
    new URL("../.output/asaas-sandbox-validation.json", import.meta.url),
  ]) {
    try {
      await readFile(previous, "utf8");
      console.error(
        "Já existe um ensaio. Use npm run asaas:resume para conferir as cobranças existentes, sem criar outras.",
      );
      process.exit(1);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  report.account_id = await asaasWallet();
  const run = randomUUID();
  const customer = await asaasCustomer({
    reference: `tinutri-test:${run}`,
    name: "TiNutri Teste Sandbox — dados fictícios",
    // CPF de exemplo da documentação oficial do Asaas. Exclusivo para ensaio sandbox.
    cpfCnpj: "24971563792",
    email: "tinutri-sandbox@example.com",
  });
  report.customer_id = customer;
  await save();
  for (const method of ["pix", "boleto", "cartao"]) {
    const reference = `tinutri-test:${randomUUID()}`;
    const dueDate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const row = {
      method,
      payment_id: null,
      reference,
      status: "creating",
      confirmed_by_simulation: false,
    };
    report.payments.push(row);
    await save();
    const payment = await asaasCreatePayment({ reference, customer, cents: 5990, method, dueDate });
    row.payment_id = payment.id;
    row.status = payment.status;
    await save();
    if (method !== "cartao") {
      await asaasRequest(`/sandbox/payment/${payment.id}/confirm`, "POST");
      const checked = await asaasGetPayment(payment.id);
      if (!["RECEIVED", "CONFIRMED"].includes(checked.status))
        throw new Error("Confirmação sandbox ainda não concluída.");
      row.status = checked.status;
      row.confirmed_by_simulation = true;
      await save();
    }
    console.log(
      `${method}: fatura sandbox criada e consultada${row.confirmed_by_simulation ? ", confirmação de teste aprovada" : "; pagamento no checkout ainda não realizado"}.`,
    );
  }
  console.log(
    "Ensaio concluído. Nenhum cartão real, dinheiro real ou Supabase remoto foi utilizado. Relatório local em integration-state.local/asaas-sandbox-validation.json.",
  );
} catch (error) {
  await save();
  // As mensagens do adaptador não incluem chave, dados de resposta ou informações de pagadores.
  console.error(
    error instanceof Error && !error.name.includes("Zod")
      ? error.message
      : "Resposta do sandbox incompatível; conferir o adaptador.",
  );
  console.error(
    "Ensaio interrompido, sem repetição automática. Confira o relatório local antes de executar novamente.",
  );
  process.exitCode = 1;
}
