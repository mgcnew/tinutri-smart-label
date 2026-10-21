import test from "node:test";
import assert from "node:assert/strict";
import {
  asaasEventHash,
  processInboxJob,
  receiveQueuedAsaas,
  type InboxPorts,
  type InboxClaim,
} from "../src/lib/contracting/webhook-queue.server.ts";
const token = "webhook-queue-test-secret-".repeat(2);
const payload = {
  id: "evt_test",
  event: "PAYMENT_RECEIVED",
  payment: { id: "pay_test", externalReference: "tinutri:offer-test" },
};
const claim: InboxClaim = {
  id: "00000000-0000-4000-8000-000000000001",
  worker_token: "00000000-0000-4000-8000-000000000002",
  event_id: payload.id,
  event_type: payload.event,
  payment_id: payload.payment.id,
  external_reference: payload.payment.externalReference,
};
const response = (state: string, status = 200) => Response.json({ state }, { status });
function harness() {
  const calls: string[] = [];
  const jobs: Promise<unknown>[] = [];
  const ports: InboxPorts = {
    enqueue: async () => {
      calls.push("persisted");
      return { id: claim.id, status: "pending" };
    },
    claim: async () => {
      calls.push("claimed");
      return claim;
    },
    verify: async () => {
      calls.push("verified");
      return response("confirmed_sandbox");
    },
    finish: async (_claim, status, code) => {
      calls.push(`finished:${status}:${code}`);
    },
  };
  const request = (value: unknown = payload, secret = token) =>
    new Request("https://example.com/api/webhooks/asaas", {
      method: "POST",
      headers: { "asaas-access-token": secret },
      body: JSON.stringify(value),
    });
  return {
    ports,
    jobs,
    calls,
    request,
    schedule: (promise: Promise<unknown>) => {
      jobs.push(promise);
    },
  };
}
test("confirma recebimento somente após persistir e sem esperar a API externa", async () => {
  const h = harness();
  let release!: (value: Response) => void;
  const slow = new Promise<Response>((resolve) => {
    release = resolve;
  });
  h.ports.verify = async () => {
    h.calls.push("external_started");
    return slow;
  };
  const result = await receiveQueuedAsaas(h.request(), token, h.ports, h.schedule);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { state: "accepted" });
  assert.equal(h.calls[0], "persisted");
  assert.equal(
    h.calls.some((call) => call.startsWith("finished")),
    false,
  );
  release(response("confirmed_sandbox"));
  await Promise.all(h.jobs);
  assert.equal(h.calls.at(-1), "finished:completed:confirmed_sandbox");
});
test("token inválido, corpo inválido e evento desconhecido não entram na fila", async () => {
  const h = harness();
  assert.equal(
    (await receiveQueuedAsaas(h.request(payload, "wrong"), token, h.ports, h.schedule)).status,
    401,
  );
  assert.equal((await receiveQueuedAsaas(h.request({}), token, h.ports, h.schedule)).status, 400);
  assert.equal(
    (
      await receiveQueuedAsaas(
        h.request({ ...payload, event: "__proto__" }),
        token,
        h.ports,
        h.schedule,
      )
    ).status,
    200,
  );
  assert.deepEqual(h.calls, []);
});
test("falha ao persistir exige reentrega, sem aceitar ou processar o evento", async () => {
  const h = harness();
  h.ports.enqueue = async () => {
    throw new Error("database unavailable");
  };
  assert.equal((await receiveQueuedAsaas(h.request(), token, h.ports, h.schedule)).status, 503);
  assert.deepEqual(h.calls, []);
  assert.equal(h.jobs.length, 0);
});
test("migração ainda ausente preserva o receptor anterior", async () => {
  const h = harness();
  h.ports.enqueue = async () => null;
  assert.equal((await receiveQueuedAsaas(h.request(), token, h.ports, h.schedule)).status, 200);
  assert.deepEqual(h.calls, ["verified"]);
  assert.equal(h.jobs.length, 0);
  h.ports.verify = async () => {
    throw new Error("unavailable");
  };
  assert.equal((await receiveQueuedAsaas(h.request(), token, h.ports, h.schedule)).status, 503);
});
test("reentrega concluída e divergência bloqueada não repetem processamento", async () => {
  const h = harness();
  for (const status of ["completed", "blocked"]) {
    h.ports.enqueue = async () => ({ id: claim.id, status });
    assert.equal((await receiveQueuedAsaas(h.request(), token, h.ports, h.schedule)).status, 200);
  }
  assert.deepEqual(h.calls, []);
  assert.equal(h.jobs.length, 0);
});
for (const scenario of [
  { state: "binding_pending", code: 503, status: "pending" },
  { state: "waiting", code: 200, status: "pending" },
  { state: "payment_mismatch", code: 409, status: "blocked" },
  { state: "ignored", code: 200, status: "completed" },
  { state: "invalidated", code: 200, status: "completed" },
]) {
  test(`preserva resultado ${scenario.state} com situação ${scenario.status}`, async () => {
    const h = harness();
    h.ports.verify = async () => response(scenario.state, scenario.code);
    await processInboxJob(claim.id, h.ports);
    assert.equal(h.calls.at(-1), `finished:${scenario.status}:${scenario.state}`);
  });
}
test("retomada preserva autor, não disputa execução reservada e persiste falha transitória", async () => {
  const h = harness();
  h.ports.claim = async (_id, actor) => {
    assert.equal(actor, "master-id");
    return null;
  };
  assert.deepEqual(await processInboxJob(claim.id, h.ports, "master-id"), {
    state: "busy_or_completed",
  });
  assert.deepEqual(h.calls, []);
  h.ports.claim = async () => claim;
  h.ports.verify = async () => {
    throw new Error("timeout");
  };
  await processInboxJob(claim.id, h.ports);
  assert.deepEqual(h.calls, ["finished:pending:retry"]);
});
test("hash contém apenas identificação necessária; campos de pagador não são persistidos", () => {
  const extra = {
    ...payload,
    payment: { ...payload.payment, email: "private@example.com", card: "never-store", value: 99 },
  };
  assert.equal(asaasEventHash(payload), asaasEventHash(extra));
  assert.notEqual(
    asaasEventHash(payload),
    asaasEventHash({ ...payload, payment: { ...payload.payment, id: "pay_other" } }),
  );
});
