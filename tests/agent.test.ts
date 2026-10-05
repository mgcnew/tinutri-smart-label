import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

import { bitmapToZpl } from "../src/lib/zpl.ts";
import { createRpc, isAllowedTarget, processOnce, sendToPrinter } from "../agent/agent-core.mjs";

function fakePrinter() {
  return new Promise<{ port: number; received: Buffer[]; close: () => Promise<void> }>(
    (resolve) => {
      const received: Buffer[] = [];
      const server = net.createServer((socket) => {
        const chunks: Buffer[] = [];
        socket.on("data", (c) => chunks.push(c));
        socket.on("end", () => {
          received.push(Buffer.concat(chunks));
          socket.end();
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as net.AddressInfo;
        resolve({ port, received, close: () => new Promise((r) => server.close(() => r())) });
      });
    },
  );
}

const blank = (w: number, h: number) => new Uint8ClampedArray(w * h * 4).fill(255);

test("envia o ZPL inteiro, byte a byte, para a impressora (60x40 e 50x30)", async () => {
  const printer = await fakePrinter();
  try {
    for (const size of [
      { widthMm: 60, heightMm: 40, w: 480, h: 320 },
      { widthMm: 50, heightMm: 30, w: 400, h: 240 },
    ]) {
      const zpl = bitmapToZpl(blank(size.w, size.h), size, { copies: 2 });
      await sendToPrinter({ host: "127.0.0.1", port: printer.port, payload: zpl });
      assert.equal(printer.received.at(-1)!.toString("utf8"), zpl);
    }
    assert.equal(printer.received.length, 2);
  } finally {
    await printer.close();
  }
});

test("impressora recusando conexão gera mensagem clara", async () => {
  await assert.rejects(
    sendToPrinter({ host: "127.0.0.1", port: 1, payload: "^XA^XZ" }),
    /recusou a conexão em 127\.0\.0\.1:1/,
  );
});

test("processOnce imprime, confirma sucesso e reporta falha sem derrubar os demais", async () => {
  const printer = await fakePrinter();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const jobs = [
    {
      job_id: "ok-1",
      host: "127.0.0.1",
      port: printer.port,
      payload: "^XA^FDum^FS^XZ",
      label_count: 1,
      attempts: 1,
    },
    { job_id: "bad-2", host: "127.0.0.1", port: 1, payload: "^XA^XZ", label_count: 3, attempts: 1 },
    {
      job_id: "ok-3",
      host: "127.0.0.1",
      port: printer.port,
      payload: "^XA^FDtres^FS^XZ",
      label_count: 1,
      attempts: 1,
    },
  ];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return name === "agent_claim_jobs" ? jobs : null;
  };
  try {
    const handled = await processOnce({ rpc, policy: { allowedPorts: [printer.port, 1] } });
    assert.equal(handled, 3);
    const finished = calls
      .filter((c) => c.name === "agent_finish_job")
      .map((c) => [c.args._job_id, c.args._ok]);
    assert.deepEqual(finished, [
      ["ok-1", true],
      ["bad-2", false],
      ["ok-3", true],
    ]);
    assert.match(
      String(calls.find((c) => c.args._job_id === "bad-2" && c.args._ok === false)!.args._error),
      /recusou/,
    );
    assert.deepEqual(
      printer.received.map((b) => b.toString()),
      ["^XA^FDum^FS^XZ", "^XA^FDtres^FS^XZ"],
    );
  } finally {
    await printer.close();
  }
});

test("agente recusa destinos fora da rede local ou em outras portas", () => {
  assert.equal(isAllowedTarget("192.168.0.50", 9100), true);
  assert.equal(isAllowedTarget("10.1.2.3", 9100), true);
  assert.equal(isAllowedTarget("172.20.0.9", 9100), true);
  assert.equal(isAllowedTarget("impressora-cozinha", 9100), true);
  assert.equal(isAllowedTarget("8.8.8.8", 9100), false);
  assert.equal(isAllowedTarget("example.com", 9100), false);
  assert.equal(isAllowedTarget("192.168.0.50", 22), false);
  assert.equal(isAllowedTarget("8.8.8.8", 9100, { allowPublic: true }), true);
});

test("destino não permitido vira falha reportada, sem abrir conexão", async () => {
  let sent = 0;
  const calls: Record<string, unknown>[] = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, ...args });
    return name === "agent_claim_jobs"
      ? [
          {
            job_id: "x",
            host: "8.8.8.8",
            port: 9100,
            payload: "^XA^XZ",
            label_count: 1,
            attempts: 1,
          },
        ]
      : null;
  };
  await processOnce({
    rpc,
    send: async () => {
      sent += 1;
    },
  });
  assert.equal(sent, 0);
  assert.equal(calls.at(-1)!._ok, false);
  assert.match(String(calls.at(-1)!._error), /não permitido/);
});

test("createRpc envia token e chave e traduz erros do servidor", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return seen.length === 1
      ? new Response("[]", { status: 200 })
      : new Response(JSON.stringify({ message: "Token de agente inválido." }), { status: 400 });
  }) as typeof fetch;
  const rpc = createRpc({
    supabaseUrl: "https://x.supabase.co/",
    anonKey: "anon",
    token: "tok",
    fetchImpl,
  });
  assert.deepEqual(await rpc("agent_claim_jobs", { _limit: 5 }), []);
  assert.equal(seen[0].url, "https://x.supabase.co/rest/v1/rpc/agent_claim_jobs");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { _token: "tok", _limit: 5 });
  assert.equal((seen[0].init.headers as Record<string, string>).apikey, "anon");
  await assert.rejects(rpc("agent_claim_jobs"), /Token de agente inválido/);
});
