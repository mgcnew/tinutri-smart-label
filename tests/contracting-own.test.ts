import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { PDFDocument } from "pdf-lib";
import { contractOffer } from "./helpers/contract-offer.ts";
import {
  ownKeys,
  codeContext,
  codeHmac,
  sealCode,
  unsealCode,
  sha256,
  evidenceHmac,
  canonicalEvidence,
  newSignatureCode,
} from "../src/lib/contracting/own-crypto.server.ts";
import {
  requestOwnCode,
  deliverOwnMail,
  finalizeOwnSignature,
  preserveOwnDocument,
  type OwnPorts,
  type OwnAcceptance,
  type OwnDocument,
  type MailClaim,
} from "../src/lib/contracting/own-flow.server.ts";
import { OWN_CONSENT, OWN_CONSENT_VERSION } from "../src/lib/contracting/own-domain.ts";
import { ownMailConfig, sendOwnSignatureCode } from "../src/lib/contracting/own-mail.server.ts";
import { ownSignatureAvailable } from "../src/lib/contracting/config.server.ts";
const keys = JSON.stringify({
  v1: { otp: "a".repeat(64), mail: "b".repeat(64), evidence: "c".repeat(64) },
});
async function isolated(run: () => Promise<void>) {
  const env = { ...process.env };
  Object.assign(process.env, {
    OWN_SIGNATURE_KEYS: keys,
    OWN_SIGNATURE_KEY_ID: "v1",
    CONTRACT_SIGNATURE_PROVIDER: "tinutri",
    CONTRACT_SIGNATURE_ENVIRONMENT: "sandbox",
    OWN_SIGNATURE_MAIL_TRANSPORT: "local",
    SIGNATURE_SMTP_HOST: "127.0.0.1",
    SIGNATURE_SMTP_PORT: "1025",
    SIGNATURE_MAIL_FROM: "tinutri@example.com",
    NODE_ENV: "test",
  });
  try {
    await run();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
}
const offer = () =>
  contractOffer({
    signature_method: "tinutri",
    signature_status: "pending",
    provider_document_id: null,
    provider_signer_id: null,
    provider_company_signer_id: null,
    provider_envelope_id: null,
  });
function harness() {
  const o = offer(),
    files = new Map<string, Uint8Array>(),
    acceptances: OwnAcceptance[] = [],
    calls: string[] = [];
  let doc: OwnDocument | null = null;
  let claim: MailClaim | null = null;
  let code = "";
  let issued: Parameters<OwnPorts["issue"]>[0] | null = null;
  let manifest: Record<string, unknown> | null = null;
  const ports: OwnPorts = {
    document: async () => doc,
    upload: async (path, bytes) => {
      files.set(path, bytes);
      calls.push("upload");
    },
    download: async (path) => files.get(path)!,
    register: async (id, hash) => {
      doc = {
        offer_id: id,
        original_sha256: hash,
        original_path: `${id}/original/${hash}.pdf`,
        final_path: null,
      };
      return doc;
    },
    issue: async (args) => {
      issued = args;
      claim = {
        challenge_id: args.id,
        worker_token: "worker",
        offer_id: args.offer,
        party: args.party,
        email: o.signer.email,
        original_sha256: args.hash,
        context_hash: args.context,
        ciphertext: args.ciphertext,
        key_id: args.key,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      calls.push("issue");
      return { state: "queued", challenge_id: args.id };
    },
    claimMail: async () => claim,
    sendMail: async (_claim, c) => {
      code = c;
      calls.push("send");
    },
    finishMail: async (_id, _worker, sent) => {
      calls.push(sent ? "sent" : "failed");
    },
    acceptances: async () => acceptances,
    finish: async (_id, path, _hash, m, hmac, kid) => {
      manifest = m;
      assert.equal(hmac, evidenceHmac(canonicalEvidence(m), kid));
      doc!.final_path = path;
      calls.push("finish");
    },
  };
  const accept = (party: "client" | "tinutri") => {
    const person = party === "client" ? o.signer : o.provider_signer;
    acceptances.push({
      offer_id: o.id,
      party,
      challenge_id:
        party === "client"
          ? "00000000-0000-4000-8000-000000000080"
          : "00000000-0000-4000-8000-000000000081",
      name: person.name,
      email: person.email,
      original_sha256: doc!.original_sha256,
      consent_version: OWN_CONSENT_VERSION,
      consent_text: OWN_CONSENT,
      accepted_at: "2026-10-21T12:00:00.000Z",
      actor_id: party === "client" ? null : "00000000-0000-4000-8000-000000000001",
    });
  };
  return {
    o,
    files,
    acceptances,
    calls,
    ports,
    accept,
    get doc() {
      return doc;
    },
    get code() {
      return code;
    },
    get issued() {
      return issued;
    },
    get manifest() {
      return manifest;
    },
  };
}
test("código HMAC e criptografia vinculam representante, contrato, contexto e chave", async () =>
  isolated(async () => {
    const context = codeContext({
      id: "challenge",
      offer: "offer",
      party: "client",
      pdf: "a".repeat(64),
      context: "b".repeat(64),
    });
    const code = "123456",
      sealed = sealCode(code, context);
    assert.equal(unsealCode(sealed, context, "v1"), code);
    assert.ok(!sealed.includes(code));
    assert.throws(() => unsealCode(sealed, context + "other", "v1"));
    assert.throws(() => unsealCode(sealed + "x", context, "v1"));
    assert.notEqual(codeHmac(code, context), codeHmac(code, context + "other"));
    for (let i = 0; i < 20; i++) assert.match(newSignatureCode(), /^\d{6}$/);
    process.env.OWN_SIGNATURE_KEYS = JSON.stringify({
      v1: { otp: "a".repeat(64), mail: "a".repeat(64), evidence: "c".repeat(64) },
    });
    assert.throws(() => ownKeys(), /distintas/);
  }));
test("configuração incompleta e SMTP local em produção não habilitam assinatura", async () =>
  isolated(async () => {
    assert.equal(ownSignatureAvailable(), true);
    process.env.NODE_ENV = "production";
    assert.equal(ownSignatureAvailable(), false);
    assert.throws(() => ownMailConfig());
    process.env.NODE_ENV = "test";
    delete process.env.OWN_SIGNATURE_KEYS;
    assert.equal(ownSignatureAvailable(), false);
  }));
test("PDF preservado antes do código, outbox criptografada e resposta nunca contém código", async () =>
  isolated(async () => {
    const h = harness();
    const result = await requestOwnCode(
      h.o,
      "client",
      h.o.token_hash,
      null,
      "d".repeat(64),
      h.ports,
    );
    assert.deepEqual(result, { state: "sent" });
    assert.deepEqual(h.calls, ["upload", "issue", "send", "sent"]);
    assert.match(h.code, /^\d{6}$/);
    assert.ok(!JSON.stringify(result).includes(h.code));
    assert.ok(!JSON.stringify(h.issued).includes(h.code));
    assert.equal(
      h.issued!.hmac,
      codeHmac(
        h.code,
        codeContext({
          id: h.issued!.id,
          offer: h.o.id,
          party: "client",
          pdf: h.doc!.original_sha256,
          context: h.o.token_hash,
        }),
      ),
    );
    await preserveOwnDocument(h.o, h.ports);
    assert.equal(h.calls.filter((x) => x === "upload").length, 1);
  }));
test("falha SMTP preserva pedido sem informar envio como confirmado", async () =>
  isolated(async () => {
    const h = harness();
    h.ports.sendMail = async () => {
      throw Error("smtp-secret");
    };
    assert.deepEqual(
      await requestOwnCode(h.o, "client", h.o.token_hash, null, "d".repeat(64), h.ports),
      { state: "pending" },
    );
    assert.equal(h.calls.at(-1), "failed");
    assert.ok(h.issued);
    h.ports.sendMail = async () => {};
    assert.deepEqual(await deliverOwnMail(h.issued!.id, h.ports), { state: "sent" });
  }));
test("limite de envio não aciona SMTP e reserva concorrente não repete mensagem", async () =>
  isolated(async () => {
    const h = harness();
    h.ports.issue = async () => ({ state: "rate_limited" });
    await assert.rejects(
      () => requestOwnCode(h.o, "client", h.o.token_hash, null, "d".repeat(64), h.ports),
      /Aguarde/,
    );
    assert.ok(!h.calls.includes("send"));
    h.ports.claimMail = async () => null;
    assert.deepEqual(await deliverOwnMail("id", h.ports), { state: "pending" });
  }));
test("dois aceites produzem PDF com comprovante e manifesto verificável sem código", async () =>
  isolated(async () => {
    const h = harness();
    await preserveOwnDocument(h.o, h.ports);
    h.accept("client");
    assert.deepEqual(await finalizeOwnSignature(h.o, h.ports), { state: "waiting" });
    h.accept("tinutri");
    const before = await PDFDocument.load(h.files.get(h.doc!.original_path)!);
    await finalizeOwnSignature(h.o, h.ports);
    const bytes = h.files.get(h.doc!.final_path!)!;
    const final = await PDFDocument.load(bytes);
    assert.ok(final.getPageCount() > before.getPageCount());
    assert.equal(h.manifest!.original_sha256, sha256(h.files.get(h.doc!.original_path)!));
    assert.ok(!JSON.stringify(h.manifest).includes("code_hmac"));
    const count = h.calls.length;
    await finalizeOwnSignature(h.o, h.ports);
    assert.equal(h.calls.length, count);
  }));
test("corrupção do PDF ou aceite divergente nunca concluem assinatura", async () =>
  isolated(async () => {
    for (const kind of ["pdf", "email", "consent"]) {
      const h = harness();
      await preserveOwnDocument(h.o, h.ports);
      h.accept("client");
      h.accept("tinutri");
      if (kind === "pdf") h.files.set(h.doc!.original_path, Buffer.from("%PDF-corrupted"));
      if (kind === "email") h.acceptances[0].email = "other@example.com";
      if (kind === "consent") h.acceptances[0].consent_version = "other";
      await assert.rejects(() => finalizeOwnSignature(h.o, h.ports));
      assert.ok(!h.calls.includes("finish"));
    }
  }));
test("falha ao finalizar preserva aceites e pode ser retomada sem novo código", async () =>
  isolated(async () => {
    const h = harness();
    await preserveOwnDocument(h.o, h.ports);
    h.accept("client");
    h.accept("tinutri");
    const finish = h.ports.finish;
    h.ports.finish = async () => {
      throw Error("db");
    };
    await assert.rejects(() => finalizeOwnSignature(h.o, h.ports));
    assert.equal(h.acceptances.length, 2);
    h.ports.finish = finish;
    assert.deepEqual(await finalizeOwnSignature(h.o, h.ports), { state: "signed" });
    assert.equal(h.calls.filter((x) => x === "issue").length, 0);
  }));
test("transporte SMTP real é exercitado apenas em caixa TCP de loopback isolada", async () =>
  isolated(async () => {
    const messages: string[] = [];
    const sockets = new Set<import("node:net").Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.write("220 localhost test SMTP\r\n");
      let data = "",
        inMessage = false,
        message = "";
      socket.on("data", (chunk) => {
        data += chunk.toString();
        while (data.includes("\r\n")) {
          const end = data.indexOf("\r\n"),
            line = data.slice(0, end);
          data = data.slice(end + 2);
          if (inMessage) {
            if (line === ".") {
              messages.push(message);
              message = "";
              inMessage = false;
              socket.write("250 accepted\r\n");
            } else message += line + "\r\n";
            continue;
          }
          if (line.startsWith("EHLO") || line.startsWith("HELO")) socket.write("250 localhost\r\n");
          else if (line === "DATA") {
            inMessage = true;
            socket.write("354 Send message\r\n");
          } else if (line === "QUIT") {
            socket.end("221 bye\r\n");
          } else socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.SIGNATURE_SMTP_PORT = String(
      (server.address() as import("node:net").AddressInfo).port,
    );
    try {
      await sendOwnSignatureCode({
        id: "local-test",
        to: "cliente@example.com",
        code: "482731",
        pdf: "a".repeat(64),
        expires: new Date(Date.now() + 600000).toISOString(),
        sandbox: true,
      });
      assert.equal(messages.length, 1);
      assert.ok(messages[0].includes("482731"));
      assert.match(messages[0], /To: cliente@example.com/);
      assert.match(messages[0], /=5BTESTE=5D/);
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }));

test("manifesto continua verificável após reordenação de chaves por jsonb", async () =>
  isolated(async () => {
    const original = { z: 1, a: [{ email: "cliente@example.com", party: "client" }], version: 1 };
    const reordered = { version: 1, a: [{ party: "client", email: "cliente@example.com" }], z: 1 };
    assert.equal(canonicalEvidence(original), canonicalEvidence(reordered));
    assert.equal(
      evidenceHmac(canonicalEvidence(original)),
      evidenceHmac(canonicalEvidence(reordered)),
    );
    assert.notEqual(
      evidenceHmac(canonicalEvidence(original)),
      evidenceHmac(canonicalEvidence({ ...reordered, z: 2 })),
    );
  }));
