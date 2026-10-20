import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  signatureWebhookHandler,
  type SignatureWebhookPorts,
} from "../src/lib/contracting/webhook-handler.server.ts";
import { contractOffer } from "./helpers/contract-offer.ts";
function setup() {
  const offer = contractOffer();
  const receipts = new Set<string>();
  const calls = { reads: 0, files: 0, completed: 0, interrupted: 0 };
  let failFile = false;
  const secret = "test-only-webhook-key";
  const ports: SignatureWebhookPorts = {
    enabled: () => true,
    environment: () => "sandbox",
    secret: () => secret,
    findOffer: async (id) => {
      calls.reads++;
      return id === offer.provider_document_id ? offer : null;
    },
    recordReceipt: async (_, id) => {
      receipts.add(id);
    },
    receiptCount: async () => receipts.size,
    signedPdf: async () => {
      calls.files++;
      if (failFile) throw new Error("temporary storage failure");
      return Buffer.from("%PDF-test");
    },
    complete: async () => {
      if (offer.signature_status !== "signed") {
        calls.completed++;
        offer.signature_status = "signed";
      }
    },
    interrupt: async (_, reason) => {
      calls.interrupted++;
      offer.signature_status = "failed";
      offer.signature_issue = reason;
    },
  };
  const request = (
    name: string,
    actor?: "client" | "provider",
    patch: Record<string, unknown> = {},
  ) => {
    const signer =
      actor === "client"
        ? { key: offer.provider_signer_id, email: offer.signer.email }
        : { key: offer.provider_company_signer_id, email: offer.provider_signer.email };
    const raw = JSON.stringify({
      event: { name, data: actor ? { signer } : null },
      document: { key: offer.provider_document_id },
      ...patch,
    });
    return new Request("http://localhost/api/webhooks/clicksign", {
      method: "POST",
      headers: {
        "Content-Hmac": "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"),
      },
      body: raw,
    });
  };
  return {
    offer,
    ports,
    request,
    receipts,
    calls,
    failFile: (next: boolean) => {
      failFile = next;
    },
    handler: () => signatureWebhookHandler(ports),
  };
}
test("webhook desativado ou HMAC inválido não consulta dados", async () => {
  const s = setup();
  s.ports.enabled = () => false;
  assert.equal((await s.handler()(s.request("sign", "client"))).status, 503);
  s.ports.enabled = () => true;
  assert.equal(
    (await s.handler()(new Request("http://localhost", { method: "POST", body: "{}" }))).status,
    401,
  );
  assert.equal(s.calls.reads, 0);
});
test("documento fechado sem as duas assinaturas nunca avança", async () => {
  const s = setup();
  assert.equal((await s.handler()(s.request("document_closed"))).status, 200);
  assert.equal((await s.handler()(s.request("sign", "client"))).status, 200);
  assert.equal((await s.handler()(s.request("document_closed"))).status, 200);
  assert.equal(s.calls.files, 0);
  assert.equal(s.calls.completed, 0);
});
test("eventos invertidos e repetidos concluem exatamente uma vez", async () => {
  const s = setup();
  await s.handler()(s.request("document_closed"));
  await s.handler()(s.request("sign", "provider"));
  await s.handler()(s.request("sign", "provider"));
  await s.handler()(s.request("sign", "client"));
  await s.handler()(s.request("auto_close"));
  await s.handler()(s.request("sign", "client"));
  assert.equal(s.receipts.size, 2);
  assert.equal(s.calls.completed, 1);
});
test("falha após recibos preserva progresso e reentrega recupera", async () => {
  const s = setup();
  s.failFile(true);
  await s.handler()(s.request("sign", "client"));
  assert.equal((await s.handler()(s.request("sign", "provider"))).status, 503);
  assert.equal(s.receipts.size, 2);
  assert.equal(s.calls.completed, 0);
  s.failFile(false);
  assert.equal((await s.handler()(s.request("document_closed"))).status, 200);
  assert.equal(s.calls.completed, 1);
});
test("ambiente, documento e representante inesperados não geram recibo", async () => {
  const s = setup();
  s.ports.environment = () => "production";
  assert.equal((await s.handler()(s.request("sign", "client"))).status, 409);
  s.ports.environment = () => "sandbox";
  assert.equal(
    (
      await s.handler()(
        s.request("sign", "client", {
          event: {
            name: "sign",
            data: { signer: { key: s.offer.provider_signer_id, email: "different@example.com" } },
          },
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await s.handler()(
        s.request("document_closed", undefined, {
          document: { key: "00000000-0000-4000-8000-000000000099" },
        }),
      )
    ).status,
    200,
  );
  assert.equal(s.receipts.size, 0);
});
for (const [name, issue] of [
  ["refusal", "refused"],
  ["cancel", "canceled"],
  ["deadline", "deadline"],
] as const) {
  test(`${name} interrompe a assinatura e não pode ser revertido por evento atrasado`, async () => {
    const s = setup();
    await s.handler()(s.request(name));
    await s.handler()(s.request(name));
    await s.handler()(s.request("sign", "client"));
    await s.handler()(s.request("sign", "provider"));
    assert.equal(s.offer.signature_issue, issue);
    assert.equal(s.calls.interrupted, 1);
    assert.equal(s.calls.completed, 0);
  });
}
test("evento de cancelamento atrasado preserva assinatura concluída", async () => {
  const s = setup();
  s.offer.signature_status = "signed";
  await s.handler()(s.request("cancel"));
  assert.equal(s.calls.interrupted, 0);
});
test("webhook limita corpo antes de ler documento ou verificar integração externa", async () => {
  const s = setup();
  const response = await s.handler()(
    new Request("http://localhost", { method: "POST", body: "a".repeat(1024 * 1024 + 1) }),
  );
  assert.equal(response.status, 413);
  assert.equal(s.calls.reads, 0);
});

test("eventos desconhecidos são ignorados sem tratar nomes herdados como comandos", async () => {
  const s = setup();
  assert.equal((await s.handler()(s.request("constructor"))).status, 200);
  assert.equal((await s.handler()(s.request("toString"))).status, 200);
  assert.equal(s.calls.reads, 0);
});
