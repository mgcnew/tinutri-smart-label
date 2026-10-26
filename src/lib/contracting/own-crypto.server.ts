import {
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { z } from "zod";
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const secret = z.string().regex(/^[a-f0-9]{64}$/i);
const keysSchema = z.record(
  z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  z.object({ otp: secret, mail: secret, evidence: secret }),
);
export function ownKeys(id = process.env.OWN_SIGNATURE_KEY_ID ?? "") {
  const all = keysSchema.parse(JSON.parse(process.env.OWN_SIGNATURE_KEYS ?? "{}"));
  if (!Object.hasOwn(all, id))
    throw new Error("Configure as chaves da assinatura própria no servidor.");
  const keys = all[id];
  if (new Set(Object.values(keys)).size !== 3)
    throw new Error("Use chaves distintas para código, envio e evidências.");
  return { id, ...keys };
}
export const newSignatureCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export function codeContext(input: {
  id: string;
  offer: string;
  party: string;
  pdf: string;
  context: string;
}) {
  return JSON.stringify([
    "tinutri-signature-v1",
    input.id,
    input.offer,
    input.party,
    input.pdf,
    input.context,
  ]);
}
export function codeHmac(code: string, context: string, keyId?: string) {
  const keys = ownKeys(keyId);
  return createHmac("sha256", Buffer.from(keys.otp, "hex"))
    .update(JSON.stringify([context, code]))
    .digest("hex");
}
export function sealCode(code: string, context: string, keyId?: string) {
  const keys = ownKeys(keyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keys.mail, "hex"), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}
export function unsealCode(payload: string, context: string, keyId: string) {
  const pieces = payload.split(".");
  if (
    pieces.length !== 3 ||
    pieces.some(
      (p) => !/^[A-Za-z0-9_-]+$/.test(p) || Buffer.from(p, "base64url").toString("base64url") !== p,
    )
  )
    throw new Error("Envelope inválido.");
  const [iv, tag, bytes] = pieces.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || bytes.length !== 6)
    throw new Error("Envelope inválido.");
  const cipher = createDecipheriv("aes-256-gcm", Buffer.from(ownKeys(keyId).mail, "hex"), iv);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag);
  return z
    .string()
    .regex(/^\d{6}$/)
    .parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8"));
}
export function evidenceHmac(manifest: string, id?: string) {
  return createHmac("sha256", Buffer.from(ownKeys(id).evidence, "hex"))
    .update(manifest)
    .digest("hex");
}
export function originHash(origin: string) {
  return createHmac("sha256", Buffer.from(ownKeys().otp, "hex"))
    .update(`signature-origin:${origin}`)
    .digest("hex");
}

/** PostgreSQL jsonb reorders object keys. Evidence uses canonical JSON before signing/verifying. */
export function canonicalEvidence(value: unknown): string {
  function sorted(input: unknown): unknown {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(sorted);
    if (typeof input === "object" && input && Object.getPrototypeOf(input) === Object.prototype) {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, sorted((input as Record<string, unknown>)[key])]),
      );
    }
    throw new Error("Formato de evidência inválido.");
  }
  return JSON.stringify(sorted(value));
}
