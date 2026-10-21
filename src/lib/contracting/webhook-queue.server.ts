import { createHash } from "node:crypto";
import {
  asaasEventSchema,
  readAsaasWebhook,
  supportedAsaasEvent,
  type AsaasWebhookEvent,
} from "./asaas-webhook-handler.server.ts";

export type InboxResult =
  | "ignored"
  | "binding_pending"
  | "account_mismatch"
  | "payment_mismatch"
  | "invalidated"
  | "waiting"
  | "confirmed_sandbox"
  | "signature_required"
  | "retry";
export type InboxClaim = {
  id: string;
  worker_token: string;
  event_id: string;
  event_type: string;
  payment_id: string;
  external_reference: string | null;
};
export interface InboxPorts {
  enqueue(event: AsaasWebhookEvent, hash: string): Promise<{ id: string; status: string } | null>;
  claim(id: string, actor?: string): Promise<InboxClaim | null>;
  finish(
    claim: InboxClaim,
    status: "pending" | "completed" | "blocked",
    result: InboxResult,
  ): Promise<void>;
  verify(event: AsaasWebhookEvent): Promise<Response>;
}
const resultCodes = new Set<InboxResult>([
  "ignored",
  "binding_pending",
  "account_mismatch",
  "payment_mismatch",
  "invalidated",
  "waiting",
  "confirmed_sandbox",
  "signature_required",
  "retry",
]);
/** Only sanitized fields needed to query the provider; never store body, headers or payer data. */
export function inboxEvent(event: AsaasWebhookEvent): AsaasWebhookEvent {
  const ref = event.payment.externalReference;
  return {
    id: event.id,
    event: event.event,
    payment: {
      id: event.payment.id,
      externalReference:
        ref?.startsWith("tinutri:") || ref?.startsWith("tinutri-test:") ? ref : null,
    },
  };
}
export function asaasEventHash(event: AsaasWebhookEvent) {
  event = inboxEvent(event);
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: event.id,
        event: event.event,
        payment: {
          id: event.payment.id,
          externalReference: event.payment.externalReference ?? null,
        },
      }),
    )
    .digest("hex");
}
export async function processInboxJob(id: string, ports: InboxPorts, actor?: string) {
  const claim = await ports.claim(id, actor);
  if (!claim) return { state: "busy_or_completed" as const };
  let result: InboxResult = "retry";
  let status: "pending" | "completed" | "blocked" = "pending";
  try {
    const event = asaasEventSchema.parse({
      id: claim.event_id,
      event: claim.event_type,
      payment: { id: claim.payment_id, externalReference: claim.external_reference },
    });
    const response = await ports.verify(event);
    const body = (await response.json()) as { state?: InboxResult };
    result = body.state && resultCodes.has(body.state) ? body.state : "retry";
    status =
      response.status >= 500 ||
      result === "waiting" ||
      result === "binding_pending" ||
      result === "retry"
        ? "pending"
        : !response.ok
          ? "blocked"
          : "completed";
  } catch {
    /* A proof already saved remains idempotent when this event is resumed. */
  }
  await ports.finish(claim, status, result);
  return { state: status, result };
}
export async function receiveQueuedAsaas(
  request: Request,
  token: string | undefined,
  ports: InboxPorts,
  schedule: (work: Promise<unknown>) => void,
) {
  const event = await readAsaasWebhook(request, token);
  if (event instanceof Response) return event;
  const reply = (state: string, status = 200) =>
    Response.json({ state }, { status, headers: { "Cache-Control": "no-store" } });
  if (!supportedAsaasEvent(event.event)) return reply("ignored");
  let saved: { id: string; status: string } | null;
  try {
    const stored = inboxEvent(event);
    saved = await ports.enqueue(stored, asaasEventHash(stored));
  } catch {
    return reply("retry", 503);
  }
  // The existing SQL 22/23/24 installation stays functional before the optional SQL 25 is applied.
  if (!saved) {
    try {
      return await ports.verify(event);
    } catch {
      return reply("retry", 503);
    }
  }
  if (saved.status === "completed") return reply("duplicate");
  if (saved.status !== "blocked") {
    // Failure never discards the durable row. Resume through the Master after a lease expires.
    try {
      schedule(processInboxJob(saved.id, ports).catch(() => undefined));
    } catch {
      /* Persisted for later recovery. */
    }
  }
  return reply("accepted");
}
