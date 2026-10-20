import { z } from "zod";
import { isIP } from "node:net";
import { asaasRequest, asaasWallet } from "./asaas.server.ts";

export const ASAAS_CONTRACT_EVENTS = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DELETED",
] as const;
export function asaasWebhookDraft(input: { url: string; email: string; token: string }) {
  const parsed = z
    .object({
      url: z.string().url(),
      email: z.string().trim().email(),
      token: z.string().regex(/^[^\s]{32,255}$/),
    })
    .parse(input);
  const url = new URL(parsed.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/webhooks/asaas" ||
    !url.hostname.includes(".") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".localhost") ||
    url.port ||
    parsed.token.startsWith("$aact_")
  )
    throw new Error("Informe a URL pública HTTPS exata de /api/webhooks/asaas e um token próprio.");
  return {
    name: "TiNutri — contratação sandbox",
    url: url.href,
    email: parsed.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: parsed.token,
    sendType: "SEQUENTIALLY" as const,
    events: [...ASAAS_CONTRACT_EVENTS],
  };
}
const remoteWebhook = z.object({
  id: z.string().min(1),
  name: z.string(),
  url: z.string().url(),
  enabled: z.boolean(),
  interrupted: z.boolean(),
});
/** Dry run by default. An inconclusive POST is never repeated automatically. */
export async function setupAsaasWebhook(
  input: { url: string; email: string; token: string },
  saved: { account: string; id: string; url: string } | null,
  apply = false,
) {
  const draft = asaasWebhookDraft(input);
  const account = await asaasWallet();
  if (saved && (saved.account !== account || saved.url !== draft.url))
    throw new Error(
      "A conta ou URL difere do registro local. Revise antes de alterar o webhook existente.",
    );
  const list = z
    .object({ data: z.array(remoteWebhook), hasMore: z.boolean() })
    .parse(await asaasRequest("/webhooks?limit=100"));
  if (list.hasMore) throw new Error("Revise a paginação dos webhooks antes de continuar.");
  const own = list.data.filter((item) => item.name === draft.name || item.url === draft.url);
  if (own.length > 1)
    throw new Error("Há webhooks concorrentes. Revise sem criar outra configuração.");
  const current = own[0];
  if (
    current &&
    (current.name !== draft.name || current.url !== draft.url || (saved && current.id !== saved.id))
  )
    throw new Error("A configuração encontrada precisa de revisão antes de sobrescrever.");
  if (saved && !current)
    throw new Error("O webhook salvo não foi encontrado na conta. Revise antes de criar outro.");
  if (!apply)
    return {
      state: "preview" as const,
      action: current ? "update" : "create",
      account,
      id: current?.id ?? null,
      url: draft.url,
    };
  // Sem segredo: a URL deve responder recusando um token deliberadamente inválido.
  const probe = await fetch(draft.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "tinutri-invalid-probe" },
    body: "{}",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (probe.status !== 401)
    throw new Error(
      "O endpoint público ainda não está pronto: a sondagem sem token válido deve responder HTTP 401.",
    );
  const configured = remoteWebhook.parse(
    await asaasRequest(
      current ? `/webhooks/${encodeURIComponent(current.id)}` : "/webhooks",
      current ? "PUT" : "POST",
      draft,
    ),
  );
  if (
    configured.name !== draft.name ||
    configured.url !== draft.url ||
    !configured.enabled ||
    configured.interrupted
  )
    throw new Error("A configuração retornada pelo Asaas precisa de revisão.");
  return {
    state: "configured" as const,
    action: current ? "update" : "create",
    account,
    id: configured.id,
    url: configured.url,
  };
}
