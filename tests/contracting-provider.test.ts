import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareClicksign,
  cancelClicksign,
  signedPdf,
} from "../src/lib/contracting/clicksign.server.ts";
import { offerLink, signatureAvailable } from "../src/lib/contracting/config.server.ts";
import { contractOffer } from "./helpers/contract-offer.ts";
async function isolated(run: () => Promise<void>) {
  const keys = [
    "CLICKSIGN_ACCESS_TOKEN",
    "CLICKSIGN_WEBHOOK_SECRET",
    "CLICKSIGN_FILE_HOSTS",
    "CONTRACT_SIGNATURE_ENVIRONMENT",
    "CONTRACT_SIGNATURE_PROVIDER",
    "CONTRACT_PUBLIC_ORIGIN",
    "NODE_ENV",
  ];
  const original = keys.map((key) => process.env[key]);
  const oldFetch = globalThis.fetch;
  process.env.CLICKSIGN_ACCESS_TOKEN = "local-test-token";
  process.env.CLICKSIGN_WEBHOOK_SECRET = "local-test-secret";
  process.env.CLICKSIGN_FILE_HOSTS = "files.example.com";
  process.env.CONTRACT_SIGNATURE_ENVIRONMENT = "sandbox";
  process.env.CONTRACT_SIGNATURE_PROVIDER = "clicksign";
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key];
      else process.env[key] = original[i];
    });
  }
}
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
test("adaptador prepara um documento e dois representantes com autenticação por e-mail", async () =>
  isolated(async () => {
    const offer = contractOffer();
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
    const trace: string[] = [];
    let signers = 0;
    globalThis.fetch = async (url, init) => {
      const path = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url: path, method: init?.method ?? "GET", body });
      trace.push("request");
      assert.equal(new Headers(init?.headers).get("Authorization"), "local-test-token");
      if (path.endsWith("/envelopes"))
        return json({ data: { id: offer.provider_envelope_id, type: "envelopes" } });
      if (path.endsWith("/documents"))
        return json({ data: { id: offer.provider_document_id, type: "documents" } });
      if (path.endsWith("/signers"))
        return json({
          data: {
            id: signers++ === 0 ? offer.provider_signer_id : offer.provider_company_signer_id,
            type: "signers",
          },
        });
      return json({});
    };
    const saved: Record<string, unknown>[] = [];
    await prepareClicksign(offer, Buffer.from("%PDF-local-test"), async (patch) => {
      saved.push(patch);
      trace.push("saved");
    });
    assert.equal(calls.length, 10);
    assert.equal(saved.length, 4);
    assert.deepEqual(trace.slice(0, 4), ["request", "saved", "request", "saved"]);
    assert.equal(
      calls.filter(
        (c) =>
          c.url.endsWith("/requirements") && JSON.stringify(c.body).includes("provide_evidence"),
      ).length,
      2,
    );
    assert.equal(
      calls.filter(
        (c) => c.url.endsWith("/requirements") && JSON.stringify(c.body).includes('"auth":"email"'),
      ).length,
      2,
    );
    assert.equal(calls.at(-2)?.method, "PATCH");
    assert.ok(calls.at(-1)?.url.endsWith("/notifications"));
  }));
test("falha ao preservar o envelope interrompe antes de criar documento ou reenviar", async () =>
  isolated(async () => {
    const offer = contractOffer();
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return json({ data: { id: offer.provider_envelope_id, type: "envelopes" } });
    };
    await assert.rejects(() =>
      prepareClicksign(offer, Buffer.from("%PDF-test"), async () => {
        throw new Error("storage unavailable");
      }),
    );
    assert.equal(requests, 1);
  }));
test("cancelamento diferencia envelope em rascunho e documento em andamento", async () =>
  isolated(async () => {
    const offer = contractOffer();
    const methods: string[] = [];
    globalThis.fetch = async (_, init) => {
      methods.push(init?.method ?? "GET");
      return methods.length === 1
        ? json({
            data: {
              id: offer.provider_envelope_id,
              type: "envelopes",
              attributes: { status: "draft" },
            },
          })
        : new Response(null, { status: 204 });
    };
    await cancelClicksign(offer);
    assert.deepEqual(methods, ["GET", "DELETE"]);
    methods.length = 0;
    globalThis.fetch = async (_, init) => {
      methods.push(init?.method ?? "GET");
      return methods.length === 1
        ? json({
            data: {
              id: offer.provider_envelope_id,
              type: "envelopes",
              attributes: { status: "running" },
            },
          })
        : json({});
    };
    await cancelClicksign(offer);
    assert.deepEqual(methods, ["GET", "PATCH"]);
  }));
test("PDF é obtido da API autenticada e download não recebe token do fornecedor", async () =>
  isolated(async () => {
    const offer = contractOffer();
    let requests = 0;
    globalThis.fetch = async (_, init) => {
      requests++;
      if (requests === 1)
        return json({
          data: [
            {
              id: offer.provider_document_id,
              type: "documents",
              attributes: { status: "closed" },
              links: { files: { signed: "https://files.example.com/contract.pdf" } },
            },
          ],
        });
      assert.equal(new Headers(init?.headers).get("Authorization"), null);
      assert.equal(init?.redirect, "error");
      return new Response("%PDF-local-test");
    };
    assert.equal(Buffer.from(await signedPdf(offer)).toString(), "%PDF-local-test");
    assert.equal(requests, 2);
  }));
test("arquivo de host não autorizado é bloqueado antes do download", async () =>
  isolated(async () => {
    const offer = contractOffer();
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return json({
        data: [
          {
            id: offer.provider_document_id,
            type: "documents",
            attributes: { status: "closed" },
            links: { files: { signed: "https://different.example.com/file.pdf" } },
          },
        ],
      });
    };
    await assert.rejects(() => signedPdf(offer), /hosts/);
    assert.equal(requests, 1);
  }));
test("origem exige HTTPS em produção e rejeita protocolos locais indevidos", async () =>
  isolated(async () => {
    process.env.NODE_ENV = "production";
    process.env.CONTRACT_PUBLIC_ORIGIN = "http://localhost:8081";
    assert.throws(() => offerLink("token"), /HTTPS/);
    process.env.NODE_ENV = "test";
    process.env.CONTRACT_PUBLIC_ORIGIN = "ftp://localhost";
    assert.throws(() => offerLink("token"), /HTTPS/);
    process.env.CONTRACT_PUBLIC_ORIGIN = "http://localhost:8081";
    assert.equal(offerLink("token"), "http://localhost:8081/contratar#token");
    process.env.CONTRACT_PUBLIC_ORIGIN = "https://user:password@example.com";
    assert.throws(() => offerLink("token"), /credenciais/);
  }));
test("configuração vazia não oferece assinatura ao cliente", async () =>
  isolated(async () => {
    assert.equal(signatureAvailable(), true);
    process.env.CLICKSIGN_FILE_HOSTS = " , ";
    assert.equal(signatureAvailable(), false);
    process.env.CLICKSIGN_FILE_HOSTS = "files.example.com";
    process.env.CLICKSIGN_ACCESS_TOKEN = " ";
    assert.equal(signatureAvailable(), false);
  }));

test("documento já concluído ou cancelado não depende de nova alteração externa", async () =>
  isolated(async () => {
    globalThis.fetch = async () => {
      throw new Error("No external request expected");
    };
    await cancelClicksign(contractOffer({ signature_status: "signed" }));
    await cancelClicksign(
      contractOffer({ signature_issue: "canceled", signature_status: "failed" }),
    );
    await cancelClicksign(
      contractOffer({ signature_issue: "deadline", signature_status: "failed" }),
    );
  }));
