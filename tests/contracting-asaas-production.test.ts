import test from "node:test";
import assert from "node:assert/strict";
import {
  asaasAvailable,
  asaasConfig,
  asaasInvoiceUrl,
  asaasRequest,
  asaasWebhookReady,
  asaasWebhookTokens,
} from "../src/lib/contracting/asaas.server.ts";
import {
  asaasRequestEnvironment,
  verifyBoundAsaasPayment,
  type AsaasWebhookPorts,
} from "../src/lib/contracting/asaas-webhook-handler.server.ts";
import {
  processInboxJob,
  receiveQueuedAsaas,
  type InboxClaim,
  type InboxPorts,
} from "../src/lib/contracting/webhook-queue.server.ts";
import { prepareContractPayment } from "../src/lib/contracting/payment-flow.server.ts";
import { contractOffer } from "./helpers/contract-offer.ts";

const sandboxToken = "sandbox-webhook-secret-".repeat(3);
const productionToken = "production-webhook-secret-".repeat(3);
const account = "00000000-0000-4000-8000-000000000090";
const keys = [
  "ASAAS_API_KEY",
  "ASAAS_ENVIRONMENT",
  "ASAAS_WEBHOOK_TOKEN",
  "ASAAS_PRODUCTION_ENABLED",
  "ASAAS_PRODUCTION_API_KEY",
  "ASAAS_PRODUCTION_WEBHOOK_TOKEN",
  "CONTRACT_PAYMENT_PROVIDER",
];
async function isolated(run: () => Promise<void> | void) {
  const values = keys.map((k) => process.env[k]);
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    ASAAS_API_KEY: "$aact_hmlg_local_test",
    ASAAS_ENVIRONMENT: "sandbox",
    ASAAS_WEBHOOK_TOKEN: sandboxToken,
    ASAAS_PRODUCTION_ENABLED: "true",
    ASAAS_PRODUCTION_API_KEY: "$aact_prod_local_test",
    ASAAS_PRODUCTION_WEBHOOK_TOKEN: productionToken,
    CONTRACT_PAYMENT_PROVIDER: "asaas",
  });
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

test("produção fica desligada sem liberação explícita e chave de produção", () =>
  isolated(() => {
    assert.equal(asaasConfig("production").base, "https://api.asaas.com/v3");
    assert.equal(asaasAvailable("production"), true);
    delete process.env.ASAAS_PRODUCTION_ENABLED;
    assert.throws(() => asaasConfig("production"), /não está habilitada/);
    assert.equal(asaasAvailable("production"), false);
    process.env.ASAAS_PRODUCTION_ENABLED = "true";
    process.env.ASAAS_PRODUCTION_API_KEY = "$aact_hmlg_sandbox_key";
    assert.throws(() => asaasConfig("production"), /não está habilitada/);
    // O sandbox não muda com a configuração de produção.
    assert.equal(asaasConfig().base, "https://api-sandbox.asaas.com/v3");
    assert.equal(asaasAvailable(), true);
  }));

test("cada ambiente exige token de webhook próprio", () =>
  isolated(() => {
    assert.deepEqual(Object.keys(asaasWebhookTokens()).sort(), ["production", "sandbox"]);
    process.env.ASAAS_PRODUCTION_WEBHOOK_TOKEN = sandboxToken;
    assert.equal(asaasWebhookReady("production"), false);
    assert.equal(asaasWebhookReady("sandbox"), false);
    process.env.ASAAS_PRODUCTION_WEBHOOK_TOKEN = "$aact_prod_local_test";
    process.env.ASAAS_PRODUCTION_API_KEY = "$aact_prod_local_test";
    assert.equal(asaasWebhookReady("production"), false);
    delete process.env.ASAAS_PRODUCTION_WEBHOOK_TOKEN;
    process.env.ASAAS_PRODUCTION_API_KEY = "$aact_prod_local_test";
    assert.deepEqual(Object.keys(asaasWebhookTokens()), ["sandbox"]);
  }));

test("fatura e API seguem o domínio do ambiente", () =>
  isolated(async () => {
    assert.equal(
      asaasInvoiceUrl("https://www.asaas.com/i/abc", "production"),
      "https://www.asaas.com/i/abc",
    );
    for (const url of [
      "https://sandbox.asaas.com/i/abc",
      "https://www.asaas.com.evil.example/i/abc",
      "https://user:pass@www.asaas.com/i/abc",
      "http://www.asaas.com/i/abc",
    ])
      assert.throws(() => asaasInvoiceUrl(url, "production"), /não pertence/);
    assert.throws(() => asaasInvoiceUrl("https://www.asaas.com/i/abc"), /sandbox/);
    const seen: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      seen.push(`${String(url)} ${new Headers(init?.headers).get("access_token")}`);
      return new Response(JSON.stringify({ ok: true }));
    }) as typeof fetch;
    await asaasRequest("/wallets/", "GET", undefined, "production");
    await asaasRequest("/wallets/");
    assert.deepEqual(seen, [
      "https://api.asaas.com/v3/wallets/ $aact_prod_local_test",
      "https://api-sandbox.asaas.com/v3/wallets/ $aact_hmlg_local_test",
    ]);
  }));

const request = (secret: string) =>
  new Request("https://example.com/api/webhooks/asaas", {
    method: "POST",
    headers: { "asaas-access-token": secret },
    body: JSON.stringify({
      id: "evt_prod",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_prod1", externalReference: "tinutri:offer" },
    }),
  });

test("o token recebido decide o ambiente da notificação", () => {
  const tokens = { sandbox: sandboxToken, production: productionToken };
  assert.equal(asaasRequestEnvironment(request(productionToken), tokens), "production");
  assert.equal(asaasRequestEnvironment(request(sandboxToken), tokens), "sandbox");
  assert.equal(asaasRequestEnvironment(request("x".repeat(40)), tokens), "sandbox");
  assert.equal(
    asaasRequestEnvironment(request(productionToken), { sandbox: sandboxToken }),
    "sandbox",
  );
});

function inbox(claimEnvironment?: "sandbox" | "production") {
  const calls: string[] = [];
  const jobs: Promise<unknown>[] = [];
  const claim: InboxClaim = {
    id: "00000000-0000-4000-8000-000000000001",
    worker_token: "00000000-0000-4000-8000-000000000002",
    event_id: "evt_prod",
    event_type: "PAYMENT_RECEIVED",
    payment_id: "pay_prod1",
    external_reference: "tinutri:offer",
    ...(claimEnvironment ? { environment: claimEnvironment } : {}),
  };
  const ports: InboxPorts = {
    enqueue: async (_event, _hash, environment) => {
      calls.push(`enqueue:${environment}`);
      return { id: claim.id, status: "pending" };
    },
    claim: async () => claim,
    verify: async (_event, environment) => {
      calls.push(`verify:${environment}`);
      return Response.json({
        state: environment === "production" ? "confirmed" : "confirmed_sandbox",
      });
    },
    finish: async (_claim, status, result) => {
      calls.push(`finish:${status}:${result}`);
    },
  };
  return { calls, jobs, ports, schedule: (job: Promise<unknown>) => void jobs.push(job) };
}

test("notificação de produção entra na fila como produção e é conferida como produção", async () => {
  const tokens = { sandbox: sandboxToken, production: productionToken };
  const h = inbox("production");
  const reply = await receiveQueuedAsaas(request(productionToken), tokens, h.ports, h.schedule);
  assert.equal(reply.status, 200);
  await Promise.all(h.jobs);
  assert.deepEqual(h.calls, [
    "enqueue:production",
    "verify:production",
    "finish:completed:confirmed",
  ]);

  const s = inbox();
  await receiveQueuedAsaas(request(sandboxToken), tokens, s.ports, s.schedule);
  await Promise.all(s.jobs);
  assert.deepEqual(s.calls, [
    "enqueue:sandbox",
    "verify:sandbox",
    "finish:completed:confirmed_sandbox",
  ]);

  const denied = inbox();
  const unauthorized = await receiveQueuedAsaas(
    request("y".repeat(40)),
    tokens,
    denied.ports,
    denied.schedule,
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(denied.calls, []);
});

test("retomada usa o ambiente gravado na fila; registro antigo sem coluna vale como sandbox", async () => {
  const h = inbox("production");
  await processInboxJob("00000000-0000-4000-8000-000000000001", h.ports);
  assert.equal(h.calls[0], "verify:production");
  const old = inbox();
  await processInboxJob("00000000-0000-4000-8000-000000000001", old.ports);
  assert.equal(old.calls[0], "verify:sandbox");
});

const payment = {
  id: "pay_prod1",
  customer: "cus_prod1",
  externalReference: `tinutri:${contractOffer().id}`,
  value: 598.8,
  billingType: "PIX" as const,
  status: "RECEIVED",
  invoiceUrl: "https://www.asaas.com/i/prod1",
};
function webhook(environment: "sandbox" | "production") {
  const offer = contractOffer({
    signature_environment: environment,
    signature_status: "signed",
    signed_file_path: "signed.pdf",
    signed_at: new Date().toISOString(),
  });
  const calls: string[] = [];
  const ports: AsaasWebhookPorts = {
    binding: async () => null,
    wallet: async () => account,
    payment: async () => ({ ...payment }),
    offer: async () => offer,
    confirm: async () => void calls.push("confirm"),
    invalidate: async () => void calls.push("invalidate"),
    activate: async () => void calls.push("activate"),
  };
  const binding = {
    offer_id: offer.id,
    account_id: account,
    customer_id: payment.customer,
    payment_id: payment.id,
  };
  return { offer, calls, ports, binding };
}

test("pagamento de produção só confirma contratação de produção", async () => {
  const prod = webhook("production");
  const ok = await verifyBoundAsaasPayment(prod.binding, prod.ports, "evt", true, "production");
  assert.deepEqual(await ok.json(), { state: "confirmed" });
  assert.deepEqual(prod.calls, ["confirm", "activate"]);

  // Notificação da conta sandbox nunca confirma contrato de produção, e vice-versa.
  const crossed = webhook("production");
  assert.equal(
    (await verifyBoundAsaasPayment(crossed.binding, crossed.ports, "evt", true, "sandbox")).status,
    409,
  );
  const reverse = webhook("sandbox");
  assert.equal(
    (await verifyBoundAsaasPayment(reverse.binding, reverse.ports, "evt", true, "production"))
      .status,
    409,
  );
  assert.deepEqual([...crossed.calls, ...reverse.calls], []);
});

test("estorno de produção consultado na API invalida em vez de confirmar", async () => {
  const h = webhook("production");
  h.ports.payment = async () => ({ ...payment, status: "REFUNDED" });
  const result = await verifyBoundAsaasPayment(h.binding, h.ports, "evt", true, "production");
  assert.deepEqual(await result.json(), { state: "invalidated" });
  assert.deepEqual(h.calls, ["invalidate"]);
});

test("cobrança aceita contratação assinada em produção", async () => {
  const offer = contractOffer({
    signature_environment: "production",
    signature_status: "signed",
    signed_file_path: "signed.pdf",
  });
  const result = await prepareContractPayment(offer, {
    wallet: async () => account,
    claim: async () => ({ state: "ready", invoice_url: "https://www.asaas.com/i/prod1" }),
    customer: async () => "cus_prod1",
    save: async () => undefined,
    create: async () => ({ id: "pay_prod1", invoiceUrl: "https://www.asaas.com/i/prod1" }),
    block: async () => undefined,
    invoice: (value) => asaasInvoiceUrl(value, "production"),
  });
  assert.equal(result.checkoutUrl, "https://www.asaas.com/i/prod1");
  await assert.rejects(
    () =>
      prepareContractPayment(
        contractOffer({
          signature_environment: "disabled",
          signature_status: "signed",
          signed_file_path: "x.pdf",
        }),
        {
          wallet: async () => account,
          claim: async () => ({ state: "busy" }),
          customer: async () => "",
          save: async () => undefined,
          create: async () => ({ id: "", invoiceUrl: "" }),
          block: async () => undefined,
          invoice: (value) => value,
        },
      ),
    /não está disponível/,
  );
});

test("sandbox confirma sem iniciar ativação; falha na ativação não desfaz a confirmação", async () => {
  const sandbox = webhook("sandbox");
  const ok = await verifyBoundAsaasPayment(sandbox.binding, sandbox.ports, "evt", true, "sandbox");
  assert.deepEqual(await ok.json(), { state: "confirmed_sandbox" });
  assert.deepEqual(sandbox.calls, ["confirm"]);

  const prod = webhook("production");
  prod.ports.activate = async () => {
    throw new Error("ativação indisponível");
  };
  const result = await verifyBoundAsaasPayment(prod.binding, prod.ports, "evt", true, "production");
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { state: "confirmed" });
  assert.deepEqual(prod.calls, ["confirm"]);
});

test("pagamento ainda não confirmado na API não inicia ativação", async () => {
  const h = webhook("production");
  h.ports.payment = async () => ({ ...payment, status: "PENDING" });
  const result = await verifyBoundAsaasPayment(h.binding, h.ports, "evt", true, "production");
  assert.deepEqual(await result.json(), { state: "waiting" });
  assert.deepEqual(h.calls, []);
});
