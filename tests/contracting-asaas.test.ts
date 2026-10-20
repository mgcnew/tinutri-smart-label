import test from "node:test";
import assert from "node:assert/strict";
import {
  asaasAvailable,
  asaasConfig,
  asaasCreatePayment,
  asaasCustomer,
  asaasGetPayment,
  asaasInvoiceUrl,
  asaasRequest,
  asaasWallet,
} from "../src/lib/contracting/asaas.server.ts";
import {
  handleAsaasWebhook,
  type AsaasWebhookPorts,
  verifyBoundAsaasPayment,
} from "../src/lib/contracting/asaas-webhook-handler.server.ts";
import { contractOffer } from "./helpers/contract-offer.ts";
import {
  prepareContractPayment,
  type CheckoutPorts,
} from "../src/lib/contracting/payment-flow.server.ts";
const token = "test-webhook-secret-".repeat(3);
const account = "00000000-0000-4000-8000-000000000090";
const payment = {
  id: "pay_test123",
  customer: "cus_test123",
  externalReference: `tinutri:${contractOffer().id}`,
  value: 598.8,
  billingType: "PIX" as const,
  status: "RECEIVED",
  invoiceUrl: "https://sandbox.asaas.com/i/test123",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function isolated(run: () => Promise<void>) {
  const keys = [
    "ASAAS_API_KEY",
    "ASAAS_ENVIRONMENT",
    "ASAAS_WEBHOOK_TOKEN",
    "CONTRACT_PAYMENT_PROVIDER",
  ];
  const values = keys.map((k) => process.env[k]);
  const oldFetch = globalThis.fetch;
  process.env.ASAAS_API_KEY = "$aact_hmlg_local_test";
  process.env.ASAAS_ENVIRONMENT = "sandbox";
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  process.env.CONTRACT_PAYMENT_PROVIDER = "asaas";
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((k, i) => {
      if (values[i] === undefined) delete process.env[k];
      else process.env[k] = values[i];
    });
  }
}
test("Asaas recusa produção e chave de ambiente divergente", () =>
  isolated(async () => {
    assert.equal(asaasAvailable(), true);
    process.env.ASAAS_WEBHOOK_TOKEN = "invalid token with spaces that must be refused";
    assert.equal(asaasAvailable(), false);
    process.env.ASAAS_WEBHOOK_TOKEN = token;
    process.env.ASAAS_ENVIRONMENT = "production";
    assert.throws(asaasConfig, /sandbox/);
    assert.equal(asaasAvailable(), false);
    process.env.ASAAS_ENVIRONMENT = "sandbox";
    process.env.ASAAS_API_KEY = "$aact_prod_not_real";
    assert.equal(asaasAvailable(), false);
  }));
test("Asaas envia credencial somente ao host fixo e recusa redirects", () =>
  isolated(async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api-sandbox.asaas.com/v3/wallets/");
      assert.equal(new Headers(init?.headers).get("access_token"), process.env.ASAAS_API_KEY);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.body, undefined);
      return json({ data: [{ id: account }] });
    };
    assert.equal(await asaasWallet(), account);
    await assert.rejects(() => asaasRequest("https://outside.example.com"), /inválido/);
    for (const value of [
      "http://sandbox.asaas.com/i/x",
      "https://asaas.com/i/x",
      "https://sandbox.asaas.com.evil.example/i/x",
      "https://user:pass@sandbox.asaas.com/i/x",
    ])
      assert.throws(() => asaasInvoiceUrl(value));
  }));
test("criação de cliente usa referência própria e desliga notificações", () =>
  isolated(async () => {
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      if (!init?.body) return json({ data: [], hasMore: false });
      const body = JSON.parse(String(init.body));
      assert.equal(body.notificationDisabled, true);
      assert.equal(body.externalReference, "tinutri:test");
      return json({ id: "cus_test123" });
    };
    assert.equal(
      await asaasCustomer({
        reference: "tinutri:test",
        name: "Fictício",
        cpfCnpj: "00000000000",
        email: "test@example.com",
      }),
      "cus_test123",
    );
    assert.equal(calls.length, 2);
  }));
test("cliente com referência existente é reutilizado e duplicidade é bloqueada", () =>
  isolated(async () => {
    globalThis.fetch = async () =>
      json({ data: [{ id: "cus_test123", externalReference: "tinutri:test" }], hasMore: false });
    const input = {
      reference: "tinutri:test",
      name: "Fictício",
      cpfCnpj: "00000000000",
      email: "test@example.com",
    };
    assert.equal(await asaasCustomer(input), "cus_test123");
    globalThis.fetch = async () =>
      json({ data: [{ id: "cus_test123" }, { id: "cus_other123" }], hasMore: false });
    await assert.rejects(() => asaasCustomer(input), /duplicado/);
  }));
test("cobrança usa valor integral e método congelado, sem dados de cartão", () =>
  isolated(async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.value, 598.8);
      assert.equal(body.billingType, "PIX");
      assert.equal(body.externalReference, payment.externalReference);
      assert.equal("creditCard" in body, false);
      return json(payment);
    };
    assert.equal(
      (
        await asaasCreatePayment({
          reference: payment.externalReference!,
          customer: payment.customer,
          cents: 59880,
          method: "pix",
          dueDate: "2030-01-01",
        })
      ).id,
      payment.id,
    );
    globalThis.fetch = async () => json({ ...payment, value: 49.9 });
    await assert.rejects(
      () =>
        asaasCreatePayment({
          reference: payment.externalReference!,
          customer: payment.customer,
          cents: 59880,
          method: "pix",
          dueDate: "2030-01-01",
        }),
      /diverge/,
    );
  }));
test("falha de API não divulga resposta nem repete operação incerta", () =>
  isolated(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error("segredo que não deve vazar");
    };
    await assert.rejects(() => asaasRequest("/payments", "POST", {}), /precisa de revisão/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => json({ secret: "confidential" }, 401);
    await assert.rejects(() => asaasGetPayment("pay_test123"), /HTTP 401/);
  }));

function harness() {
  const offer = contractOffer({
    signature_status: "signed",
    signed_file_path: "signed.pdf",
    signed_at: new Date().toISOString(),
  });
  const calls: string[] = [];
  const ports: AsaasWebhookPorts = {
    binding: async () => ({
      offer_id: offer.id,
      account_id: account,
      customer_id: payment.customer,
      payment_id: payment.id,
    }),
    wallet: async () => account,
    payment: async () => ({ ...payment }),
    offer: async () => offer,
    confirm: async () => {
      calls.push("confirm");
    },
    invalidate: async () => {
      calls.push("invalidate");
    },
  };
  const request = (event = "PAYMENT_RECEIVED", auth = token) =>
    new Request("https://example.com/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": auth },
      body: JSON.stringify({
        id: "evt_test",
        event,
        payment: { id: payment.id, externalReference: payment.externalReference, value: 0.01 },
      }),
    });
  return { offer, calls, ports, request };
}
test("webhook exige token antes de acessar serviços e limita tamanho", async () => {
  const h = harness();
  h.ports.binding = async () => {
    throw new Error("não deveria executar");
  };
  assert.equal(
    (await handleAsaasWebhook(h.request("PAYMENT_RECEIVED", "bad"), token, h.ports)).status,
    401,
  );
  const request = h.request();
  request.headers.set("content-length", "1048577");
  assert.equal((await handleAsaasWebhook(request, token, h.ports)).status, 413);
});
test("webhook consulta a API e ignora o valor declarado no evento", async () => {
  const h = harness();
  assert.equal((await handleAsaasWebhook(h.request(), token, h.ports)).status, 200);
  assert.deepEqual(h.calls, ["confirm"]);
});
test("eventos repetidos chegam à confirmação idempotente do banco", async () => {
  const h = harness();
  await handleAsaasWebhook(h.request(), token, h.ports);
  await handleAsaasWebhook(h.request(), token, h.ports);
  assert.deepEqual(h.calls, ["confirm", "confirm"]);
});
for (const condition of [
  "account",
  "value",
  "reference",
  "customer",
  "method",
  "production",
  "signature",
]) {
  test(`webhook recusa divergência ${condition}`, async () => {
    const h = harness();
    if (condition === "account") h.ports.wallet = async () => "another-wallet";
    if (condition === "value") h.ports.payment = async () => ({ ...payment, value: 49.9 });
    if (condition === "reference")
      h.ports.payment = async () => ({ ...payment, externalReference: "other" });
    if (condition === "customer")
      h.ports.payment = async () => ({ ...payment, customer: "cus_other" });
    if (condition === "method")
      h.ports.payment = async () => ({ ...payment, billingType: "BOLETO" });
    if (condition === "production") h.offer.signature_environment = "production";
    if (condition === "signature") h.offer.signed_file_path = null;
    assert.equal((await handleAsaasWebhook(h.request(), token, h.ports)).status, 409);
    assert.deepEqual(h.calls, []);
  });
}
test("evento confirmado atrasado não supera estorno consultado na API", async () => {
  const h = harness();
  h.ports.payment = async () => ({ ...payment, status: "REFUNDED" });
  await handleAsaasWebhook(h.request(), token, h.ports);
  assert.deepEqual(h.calls, ["invalidate"]);
});
test("falha transitória solicita nova entrega e pagamento pendente não confirma", async () => {
  const h = harness();
  h.ports.payment = async () => ({ ...payment, status: "PENDING" });
  assert.equal((await handleAsaasWebhook(h.request(), token, h.ports)).status, 200);
  assert.deepEqual(h.calls, []);
  h.ports.payment = async () => {
    throw new Error("unavailable");
  };
  assert.equal((await handleAsaasWebhook(h.request(), token, h.ports)).status, 503);
});

function checkoutHarness() {
  const calls: string[] = [];
  const offer = contractOffer({
    signature_status: "signed",
    signed_file_path: "signed.pdf",
    signed_at: new Date().toISOString(),
  });
  const ports: CheckoutPorts = {
    wallet: async () => account,
    claim: async () => ({ state: "claimed", worker_token: account }),
    customer: async () => {
      calls.push("customer");
      return payment.customer;
    },
    save: async (_token, _customer, paid) => {
      calls.push(paid ? "saved-payment" : "saved-customer");
    },
    create: async () => {
      calls.push("create");
      return payment;
    },
    block: async () => {
      calls.push("blocked");
    },
    invoice: asaasInvoiceUrl,
  };
  return { calls, offer, ports };
}
test("preparação preserva cliente e cobrança em ordem antes de expor a fatura", async () => {
  const h = checkoutHarness();
  assert.equal((await prepareContractPayment(h.offer, h.ports)).checkoutUrl, payment.invoiceUrl);
  assert.deepEqual(h.calls, ["customer", "saved-customer", "create", "saved-payment"]);
});
test("reserva pronta reutiliza fatura e reserva ocupada não cria cliente", async () => {
  const h = checkoutHarness();
  h.ports.claim = async () => ({ state: "ready", invoice_url: payment.invoiceUrl });
  assert.equal((await prepareContractPayment(h.offer, h.ports)).checkoutUrl, payment.invoiceUrl);
  h.ports.claim = async () => ({ state: "busy" });
  await assert.rejects(() => prepareContractPayment(h.offer, h.ports), /Não gere outra cobrança/);
  assert.deepEqual(h.calls, []);
});
test("timeout da cobrança bloqueia a reserva sem repetir criação", async () => {
  const h = checkoutHarness();
  h.ports.create = async () => {
    h.calls.push("uncertain");
    throw new Error("timeout");
  };
  await assert.rejects(() => prepareContractPayment(h.offer, h.ports), /conferir o Asaas/);
  assert.deepEqual(h.calls, ["customer", "saved-customer", "uncertain", "blocked"]);
});
test("falha ao preservar cliente impede criação da cobrança", async () => {
  const h = checkoutHarness();
  h.ports.save = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(() => prepareContractPayment(h.offer, h.ports), /conferir o Asaas/);
  assert.deepEqual(h.calls, ["customer", "blocked"]);
});
test("contrato sem assinatura ou já reembolsado não chega ao provedor", async () => {
  const h = checkoutHarness();
  h.offer.signed_file_path = null;
  await assert.rejects(() => prepareContractPayment(h.offer, h.ports), /não está disponível/);
  h.offer.signed_file_path = "signed.pdf";
  h.offer.payment_status = "refunded";
  await assert.rejects(() => prepareContractPayment(h.offer, h.ports), /não está disponível/);
  assert.deepEqual(h.calls, []);
});

test("conferência administrativa usa o mesmo vínculo e pagamento verificado", async () => {
  const h = harness();
  const binding = await h.ports.binding(payment.id);
  const result = await verifyBoundAsaasPayment(binding!, h.ports, `reconcile:${payment.id}`);
  assert.deepEqual(await result.json(), { state: "confirmed_sandbox" });
  assert.deepEqual(h.calls, ["confirm"]);
});
test("conferência administrativa também invalida estorno consultado na API", async () => {
  const h = harness();
  h.ports.payment = async () => ({ ...payment, status: "REFUNDED" });
  const binding = await h.ports.binding(payment.id);
  const result = await verifyBoundAsaasPayment(binding!, h.ports, `reconcile:${payment.id}`);
  assert.deepEqual(await result.json(), { state: "invalidated" });
  assert.deepEqual(h.calls, ["invalidate"]);
});
test("conferência não aceita contrato diferente do vínculo financeiro", async () => {
  const h = harness();
  const binding = await h.ports.binding(payment.id);
  const result = await verifyBoundAsaasPayment(
    { ...binding!, offer_id: account },
    h.ports,
    "reconcile:test",
  );
  assert.equal(result.status, 409);
  assert.deepEqual(h.calls, []);
});
