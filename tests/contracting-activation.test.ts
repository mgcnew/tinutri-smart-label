import test from "node:test";
import assert from "node:assert/strict";
import {
  activateContract,
  type ActivationPorts,
} from "../src/lib/contracting/activation-flow.server.ts";
const id = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000002";
function setup() {
  const calls: string[] = [];
  const claim = {
    state: "claimed",
    token: id,
    offer_id: id,
    client_id: id,
    contact: { name: "Responsável teste", email: "teste@example.com" },
    user_id: null as string | null,
  };
  const ports: ActivationPorts = {
    claim: async () => claim,
    candidate: async () => null,
    invite: async () => {
      calls.push("invite");
      return user;
    },
    remember: async () => {
      calls.push("remember");
      claim.user_id = user;
    },
    finish: async () => {
      calls.push("finish");
    },
    block: async (_, code) => {
      calls.push(`blocked:${code}`);
    },
  };
  return { ports, calls, claim };
}
test("ativação cria convite, preserva usuário e só então conclui", async () => {
  const s = setup();
  assert.equal((await activateContract(id, s.ports)).state, "completed");
  assert.deepEqual(s.calls, ["invite", "remember", "finish"]);
});
test("conta elegível já existente não recebe convite repetido", async () => {
  const s = setup();
  s.ports.candidate = async () => ({ id: user, allowed: true });
  await activateContract(id, s.ports);
  assert.deepEqual(s.calls, ["remember", "finish"]);
});
test("conta de outro vínculo exige revisão e não é transferida", async () => {
  const s = setup();
  s.ports.candidate = async () => ({ id: user, allowed: false });
  assert.deepEqual(await activateContract(id, s.ports), {
    state: "blocked",
    code: "account_conflict",
  });
  assert.deepEqual(s.calls, ["blocked:account_conflict"]);
});
for (const state of ["busy", "completed"] as const) {
  test(`execução ${state} não duplica convite nem ativação`, async () => {
    const s = setup();
    s.ports.claim = async () => ({ state });
    assert.deepEqual(await activateContract(id, s.ports), { state });
    assert.deepEqual(s.calls, []);
  });
}
test("resposta incerta do convite bloqueia antes de vincular", async () => {
  const s = setup();
  s.ports.invite = async () => {
    throw new Error("timeout");
  };
  assert.deepEqual(await activateContract(id, s.ports), {
    state: "blocked",
    code: "invite_uncertain",
  });
  assert.deepEqual(s.calls, ["blocked:invite_uncertain"]);
});
test("falha de conclusão pode retomar com usuário preservado sem reenviar convite", async () => {
  const s = setup();
  s.ports.finish = async () => {
    throw new Error("payment reversed");
  };
  assert.deepEqual(await activateContract(id, s.ports), {
    state: "blocked",
    code: "activation_unavailable",
  });
  s.ports.candidate = async () => ({ id: user, allowed: true });
  s.ports.finish = async () => {
    s.calls.push("finish");
  };
  await activateContract(id, s.ports);
  assert.equal(s.calls.filter((call) => call === "invite").length, 1);
});
test("usuário reservado que desapareceu não dispara outro convite", async () => {
  const s = setup();
  s.claim.user_id = user;
  assert.deepEqual(await activateContract(id, s.ports), {
    state: "blocked",
    code: "account_conflict",
  });
  assert.deepEqual(s.calls, ["blocked:account_conflict"]);
});
