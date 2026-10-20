import { z } from "zod";
import type { Offer } from "./domain";
import { signatureEnvironment } from "./config.server.ts";

const resource = z.object({
  id: z.string().uuid(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  links: z.record(z.string(), z.unknown()).optional(),
});
const one = z.object({ data: resource });
export function clicksignBase() {
  return signatureEnvironment() === "production"
    ? "https://app.clicksign.com"
    : "https://sandbox.clicksign.com";
}
export async function clicksignRequest(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  if (!process.env.CLICKSIGN_ACCESS_TOKEN)
    throw new Error("Assinatura eletrônica ainda não configurada.");
  const response = await fetch(`${clicksignBase()}/api/v3${path}`, {
    method,
    headers: {
      Authorization: process.env.CLICKSIGN_ACCESS_TOKEN,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`O serviço de assinatura não concluiu a operação (HTTP ${response.status}).`);
  if (response.status === 204) return null;
  return response.json();
}
const payload = (type: string, attributes: Record<string, unknown>, id?: string) => ({
  data: { type, ...(id ? { id } : {}), attributes },
});
/** Persist each external identifier immediately. An uncertain failure is never retried blindly. */
export async function prepareClicksign(
  offer: Offer,
  pdf: Uint8Array,
  save: (patch: Partial<Offer>) => Promise<void>,
) {
  const envelope = one.parse(
    await clicksignRequest(
      "/envelopes",
      "POST",
      payload("envelopes", {
        name: `TiNutri · ${offer.id}`,
        locale: "pt-BR",
        auto_close: true,
        deadline_at: offer.expires_at,
      }),
    ),
  ).data.id;
  await save({ provider_envelope_id: envelope });
  const document = one.parse(
    await clicksignRequest(
      `/envelopes/${envelope}/documents`,
      "POST",
      payload("documents", {
        filename: `contrato-${offer.id}.pdf`,
        content_base64: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`,
      }),
    ),
  ).data.id;
  await save({ provider_document_id: document });
  for (const [index, person] of [offer.signer, offer.provider_signer].entries()) {
    const signer = one.parse(
      await clicksignRequest(
        `/envelopes/${envelope}/signers`,
        "POST",
        payload("signers", {
          name: person.name,
          email: person.email,
          has_documentation: false,
          communicate_events: {
            signature_request: "email",
            signature_reminder: "email",
            document_signed: "email",
          },
        }),
      ),
    ).data.id;
    if (index === 0) await save({ provider_signer_id: signer });
    else await save({ provider_company_signer_id: signer });
    for (const attributes of [
      { action: "agree", role: "sign" },
      { action: "provide_evidence", auth: "email" },
    ]) {
      await clicksignRequest(`/envelopes/${envelope}/requirements`, "POST", {
        data: {
          type: "requirements",
          attributes,
          relationships: {
            document: { data: { type: "documents", id: document } },
            signer: { data: { type: "signers", id: signer } },
          },
        },
      });
    }
  }
  await clicksignRequest(
    `/envelopes/${envelope}`,
    "PATCH",
    payload("envelopes", { status: "running" }, envelope),
  );
  await clicksignRequest(
    `/envelopes/${envelope}/notifications`,
    "POST",
    payload("notifications", {}),
  );
}
export async function cancelClicksign(offer: Offer) {
  if (
    !offer.provider_envelope_id ||
    offer.signature_status === "signed" ||
    offer.signature_issue === "canceled" ||
    offer.signature_issue === "deadline"
  )
    return;
  const envelope = one.parse(await clicksignRequest(`/envelopes/${offer.provider_envelope_id}`));
  const state = envelope.data.attributes?.status;
  if (state === "draft") {
    await clicksignRequest(`/envelopes/${offer.provider_envelope_id}`, "DELETE");
    return;
  }
  if (state === "canceled" || state === "closed") return;
  if (state !== "running" || !offer.provider_document_id)
    throw new Error("Verifique o envelope no provedor antes de revogar esta contratação.");
  await clicksignRequest(
    `/envelopes/${offer.provider_envelope_id}/documents/${offer.provider_document_id}`,
    "PATCH",
    payload("documents", { status: "canceled" }, offer.provider_document_id),
  );
}
/** Only a file URL freshly obtained from the authenticated provider API may be downloaded. */
export async function signedPdf(offer: Offer): Promise<Uint8Array> {
  const response = z
    .object({ data: z.array(resource) })
    .parse(await clicksignRequest(`/envelopes/${offer.provider_envelope_id}/documents`));
  const doc = response.data.find((item) => item.id === offer.provider_document_id);
  if (!doc || doc.attributes?.status !== "closed")
    throw new Error("O documento assinado ainda está sendo finalizado.");
  const files = z.object({ signed: z.string().url() }).parse(doc.links?.files);
  const url = new URL(files.signed);
  const allowed = (process.env.CLICKSIGN_FILE_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    !allowed.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(
      "Configure os hosts de arquivos autorizados da Clicksign antes de receber documentos.",
    );
  const result = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!result.ok || !result.body) throw new Error("Não foi possível baixar o documento assinado.");
  const reader = result.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 20 * 1024 * 1024) throw new Error("Documento excede o limite de 20 MB.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("O provedor não retornou um PDF válido.");
  return bytes;
}
