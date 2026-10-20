import test from "node:test";
import assert from "node:assert/strict";
import { asaasWebhookDraft, setupAsaasWebhook } from "../src/lib/contracting/asaas-setup.server.ts";
const account = "00000000-0000-4000-8000-000000000090";
const input = {
  url: "https://example.com/api/webhooks/asaas",
  email: "technical@example.com",
  token: "webhook-secret-for-tests-".repeat(2),
};
const draft = asaasWebhookDraft(input);
const current = {
  id: "wbh_test",
  name: draft.name,
  url: draft.url,
  enabled: true,
  interrupted: false,
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
async function isolated(run: () => Promise<void>) {
  const old = globalThis.fetch;
  const key = process.env.ASAAS_API_KEY;
  const env = process.env.ASAAS_ENVIRONMENT;
  process.env.ASAAS_API_KEY = "$aact_hmlg_test-only";
  process.env.ASAAS_ENVIRONMENT = "sandbox";
  try {
    await run();
  } finally {
    globalThis.fetch = old;
    if (key === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = key;
    if (env === undefined) delete process.env.ASAAS_ENVIRONMENT;
    else process.env.ASAAS_ENVIRONMENT = env;
  }
}
test("configuração usa eventos financeiros necessários e token separado", () => {
  assert.equal(draft.sendType, "SEQUENTIALLY");
  assert.equal(draft.authToken, input.token);
  assert.equal(draft.events.includes("PAYMENT_RECEIVED"), true);
  assert.equal(draft.events.includes("PAYMENT_DELETED"), true);
});
for (const url of [
  "http://example.com/api/webhooks/asaas",
  "https://localhost/api/webhooks/asaas",
  "https://127.0.0.1/api/webhooks/asaas",
  "https://10.0.0.1/api/webhooks/asaas",
  "https://[::1]/api/webhooks/asaas",
  "https://example.com/other",
  "https://user:pass@example.com/api/webhooks/asaas",
  "https://example.com/api/webhooks/asaas?token=secret",
  "https://example.com/api/webhooks/asaas#token",
  "https://example.local/api/webhooks/asaas",
]) {
  test(`configuração recusa URL imprópria ${url}`, () =>
    assert.throws(() => asaasWebhookDraft({ ...input, url })));
}
test("prévia consulta conta e configurações sem criar webhook", () =>
  isolated(async () => {
    const methods: string[] = [];
    globalThis.fetch = async (url, init) => {
      methods.push(init?.method ?? "GET");
      if (String(url).endsWith("/wallets/")) return json({ data: [{ id: account }] });
      return json({ data: [], hasMore: false });
    };
    const result = await setupAsaasWebhook(input, null);
    assert.equal(result.state, "preview");
    assert.equal(result.action, "create");
    assert.deepEqual(methods, ["GET", "GET"]);
  }));
test("aplicação verifica endpoint sem segredo antes de cadastrar", () =>
  isolated(async () => {
    let created = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url) === input.url) {
        const headers = new Headers(init?.headers);
        assert.equal(headers.has("access_token"), false);
        assert.notEqual(headers.get("asaas-access-token"), input.token);
        assert.equal(init?.redirect, "error");
        return json({}, 401);
      }
      if (String(url).endsWith("/wallets/")) return json({ data: [{ id: account }] });
      if (init?.method === "POST") {
        created++;
        assert.equal(JSON.parse(String(init.body)).authToken, input.token);
        return json(current);
      }
      return json({ data: [], hasMore: false });
    };
    const result = await setupAsaasWebhook(input, null, true);
    assert.equal(result.state, "configured");
    assert.equal(created, 1);
  }));
test("endpoint indisponível impede cadastro e token não é enviado na sondagem", () =>
  isolated(async () => {
    let created = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url) === input.url) return json({}, 503);
      if (String(url).endsWith("/wallets/")) return json({ data: [{ id: account }] });
      if (init?.method === "POST") created++;
      return json({ data: [], hasMore: false });
    };
    await assert.rejects(() => setupAsaasWebhook(input, null, true), /HTTP 401/);
    assert.equal(created, 0);
  }));
test("configuração existente é atualizada sem criar duplicata", () =>
  isolated(async () => {
    const writes: string[] = [];
    globalThis.fetch = async (url, init) => {
      if (String(url) === input.url) return json({}, 401);
      if (String(url).endsWith("/wallets/")) return json({ data: [{ id: account }] });
      if (init?.method === "PUT" || init?.method === "POST") {
        writes.push(init.method);
        return json(current);
      }
      return json({ data: [current], hasMore: false });
    };
    const result = await setupAsaasWebhook(
      input,
      { account, id: current.id, url: input.url },
      true,
    );
    assert.equal(result.action, "update");
    assert.deepEqual(writes, ["PUT"]);
  }));
test("conta divergente e webhooks concorrentes exigem revisão", () =>
  isolated(async () => {
    globalThis.fetch = async (url) =>
      String(url).endsWith("/wallets/")
        ? json({ data: [{ id: account }] })
        : json({ data: [current, { ...current, id: "wbh_duplicate" }], hasMore: false });
    await assert.rejects(
      () => setupAsaasWebhook(input, { account: "other", id: current.id, url: input.url }, true),
      /conta ou URL/,
    );
    await assert.rejects(() => setupAsaasWebhook(input, null, true), /concorrentes/);
  }));
test("falha inconclusiva de criação não repete POST", () =>
  isolated(async () => {
    let writes = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url) === input.url) return json({}, 401);
      if (String(url).endsWith("/wallets/")) return json({ data: [{ id: account }] });
      if (init?.method === "POST") {
        writes++;
        throw new Error("timeout");
      }
      return json({ data: [], hasMore: false });
    };
    await assert.rejects(() => setupAsaasWebhook(input, null, true), /precisa de revisão/);
    assert.equal(writes, 1);
  }));
