// Local browser fixture only. This module is never imported by the application build.
import type {
  Offer,
  PublicOffer,
  OfferEvent,
  ActivationSummary,
} from "../../src/lib/contracting/domain";
const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "pending";
export const fixture = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Contrato de licença de uso",
  body: "CONTRATO DE TESTE LOCAL\n\nCondições fictícias para verificar a interface. São Paulo, utilização e segurança.\n\n".repeat(
    30,
  ),
  body_sha256: "a".repeat(64),
  company_name: "Empresa de teste com nome extenso para verificar a apresentação no celular",
  commercial: {
    start: "activation",
    payment: "pix",
    renewal: "manual",
    plan: { cycle: "anual", months: 12, monthly_cents: 4990, total_cents: 59880 },
  },
  expires_at: "2030-01-01T00:00:00Z",
  signature_status: "pending",
  payment_status: "unconfigured",
  signature_environment: "sandbox",
  signed_at: null,
  activated_at: null,
  stage: "signature",
  signerName: "Representante de teste",
  signerEmailHint: "cl•••@example.com",
  signatureAvailable: scenario !== "disabled",
  paymentAvailable: false,
  signedDocumentAvailable: false,
} satisfies PublicOffer;
let current: PublicOffer = structuredClone(fixture);
const ownSummary = {
  clientAccepted: false,
  tinutriAccepted: false,
  maySign: true,
  challenge: null,
} as import("../../src/lib/contracting/own-domain").OwnSignatureSummary;
if (scenario.startsWith("own"))
  current = { ...current, signatureMethod: "tinutri", ownSignature: structuredClone(ownSummary) };
if (scenario === "own-finalizing")
  current = {
    ...current,
    signature_status: "awaiting",
    ownSignature: { ...ownSummary, clientAccepted: true, tinutriAccepted: true },
  };

if (["signed", "sandbox-payment", "sandbox-payment-failure"].includes(scenario))
  current = {
    ...current,
    signature_status: "signed",
    signed_at: "2026-10-20T12:00:00Z",
    stage: "payment",
    signedDocumentAvailable: true,
    paymentAvailable: scenario !== "signed",
  };
export async function payOffer() {
  if (scenario === "sandbox-payment-failure")
    throw new Error("A cobrança precisa de revisão pela TiNutri.");
  current = { ...current, payment_status: "pending" };
  return { checkoutUrl: "https://sandbox.asaas.com/i/test-only" };
}
if (scenario === "refused")
  current = { ...current, signature_status: "failed", signatureIssue: "refused" };
if (scenario === "awaiting") current = { ...current, signature_status: "awaiting" };
let attempts = 0;
export async function readPublicOffer() {
  attempts++;
  if (scenario === "expired" || (scenario === "retry" && attempts === 1))
    throw new Error("Este link está indisponível ou expirou. Solicite um novo link à TiNutri.");
  return structuredClone(current);
}
export async function beginSignature() {
  if (scenario.startsWith("own")) {
    current = {
      ...current,
      signature_status: "awaiting",
      ownSignature: {
        ...ownSummary,
        challenge: {
          id: fixture.id,
          expiresAt: "2030-01-01T00:00:00Z",
          delivery: scenario === "own-mail-failure" ? "failed" : "sent",
        },
      },
    };
    return { state: scenario === "own-mail-failure" ? "pending" : "sent" };
  }
  window.dispatchEvent(new CustomEvent("fixture-sign-request"));
  current = { ...current, signature_status: "awaiting" };
  return { requested: true };
}
export async function downloadOffer() {
  return { url: null, base64: "JVBERi0xLjQKJSBUZXN0IG9ubHk=" };
}
type TestOffer = Partial<Offer> & {
  events: OfferEvent[];
  activation: ActivationSummary | null;
  checkout: { status: "preparing" | "ready" | "blocked" } | null;
  ownSignature?: import("../../src/lib/contracting/own-domain").OwnSignatureSummary;
};
function preparedOffer(): TestOffer {
  return {
    id: fixture.id,
    signature_status: "pending",
    payment_status: "unconfigured",
    signature_environment: "sandbox",
    activated_at: null,
    revoked_at: null,
    expires_at: fixture.expires_at,
    created_at: "2026-10-20T12:00:00Z",
    signer: { name: fixture.signerName, email: "cliente@example.com" },
    provider_signer: { name: "TiNutri teste", email: "tinutri@example.com" },
    access_contact: { name: "Acesso teste", email: "acesso@example.com" },
    events: [{ kind: "published", created_at: "2026-10-20T12:00:00Z" }],
    activation: null,
    checkout: null,
  };
}
let offers: TestOffer[] =
  scenario === "master-blocked"
    ? [
        {
          ...preparedOffer(),
          signature_status: "signed",
          payment_status: "confirmed",
          signature_environment: "production",
          activation: { status: "blocked", error_code: "account_conflict" },
        },
      ]
    : scenario === "master-payment" || scenario === "master-payment-mismatch"
      ? [
          {
            ...preparedOffer(),
            signature_status: "signed",
            payment_status: "pending",
            checkout: { status: "ready" },
          },
        ]
      : [];
export async function checkPayment() {
  if (scenario === "master-payment-mismatch")
    throw new Error(
      "A cobrança precisa de revisão: confira conta, valor e assinatura antes de continuar.",
    );
  offers = offers.map((offer) => ({
    ...offer,
    payment_status: "confirmed",
    events: [{ kind: "payment_checked", created_at: "2026-10-20T12:00:00Z" }, ...offer.events],
  }));
  return { state: "confirmed_sandbox" };
}
export async function retryOfferActivation() {
  offers = offers.map((o) => ({
    ...o,
    activated_at: "2026-10-20T12:00:00Z",
    activation: { status: "completed", error_code: null },
    events: [{ kind: "access_activated", created_at: "2026-10-20T12:00:00Z" }, ...o.events],
  }));
  return { state: "completed" };
}
if (scenario.startsWith("master-own"))
  offers = [
    {
      ...preparedOffer(),
      signature_method: "tinutri",
      signature_status: "awaiting",
      ownSignature: {
        ...ownSummary,
        clientAccepted: true,
        tinutriAccepted: scenario === "master-own-finalize",
      },
    },
  ];
export async function listOffers() {
  return {
    offers: structuredClone(offers),
    signatureAvailable: scenario.startsWith("master-own"),
    signatureMethod: scenario.startsWith("master-own") ? "tinutri" : "clicksign",
    activationAvailable: scenario === "master-blocked",
    environment: scenario === "master-blocked" ? "production" : "sandbox",
    paymentAvailable: false,
    paymentCheckAvailable: true,
    paymentCheckEnvironments: ["sandbox"],
  };
}
export async function publishOffer() {
  offers = [preparedOffer()];
  return { id: fixture.id, link: "http://localhost:8083/contratar#" + "a".repeat(43) };
}
export async function manageOffer({ data }: { data: { action: string } }) {
  if (data.action === "revoke") {
    offers = offers.map((o) => ({ ...o, revoked_at: "2026-10-20T12:00:00Z" }));
    return { link: null };
  }
  return { link: "http://localhost:8083/contratar#" + "b".repeat(43) };
}

const notifications: import("../../src/lib/contracting/notification-domain").PaymentNotification[] =
  Array.from({ length: 21 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    event_type: i === 0 ? "PAYMENT_RECEIVED" : "PAYMENT_REFUNDED",
    status: i === 0 ? "pending" : "completed",
    result_code: i === 0 ? "retry" : "invalidated",
    attempts: 1,
    deliveries: 1,
    received_at: "2026-10-21T12:00:00Z",
    updated_at: "2026-10-21T12:00:00Z",
    locked_until: null,
  }));
export async function listPaymentNotifications({ data }: { data: { page: number } }) {
  if (scenario === "notifications-missing") return { installed: false, rows: [], total: 0 };
  return {
    installed: true,
    rows: structuredClone(notifications.slice(data.page * 10, data.page * 10 + 10)),
    total: notifications.length,
  };
}
export async function retryPaymentNotification({ data }: { data: { id: string } }) {
  if (scenario === "notifications-failure")
    throw new Error("Serviço temporariamente indisponível.");
  const row = notifications.find((item) => item.id === data.id)!;
  row.status = "completed";
  row.result_code = "confirmed_sandbox";
  row.attempts++;
  return { state: "completed" };
}

export async function confirmOwnSignature({ data }: { data: { code: string } }) {
  if (data.code !== "482731")
    throw new Error(
      "Código inválido, expirado ou indisponível. Solicite um novo código se necessário.",
    );
  current = { ...current, ownSignature: { ...ownSummary, clientAccepted: true } };
  return { state: "waiting" };
}
export async function masterOwnSignature({
  data,
}: {
  data: { action: string; confirmation?: { code: string } };
}) {
  if (data.action === "confirm" && data.confirmation?.code !== "482731")
    throw new Error("Código inválido, expirado ou indisponível.");
  offers = offers.map((o) => ({
    ...o,
    ownSignature: {
      ...ownSummary,
      clientAccepted: true,
      tinutriAccepted: data.action !== "request",
      challenge:
        data.action === "request"
          ? { id: fixture.id, expiresAt: "2030-01-01T00:00:00Z", delivery: "sent" }
          : null,
    },
    signature_status:
      data.action === "confirm" || data.action === "finalize" ? "signed" : "awaiting",
  }));
  return { state: data.action === "confirm" || data.action === "finalize" ? "signed" : "sent" };
}

export async function downloadOwnContract() {
  return { url: "https://example.com/private-original.pdf" };
}
