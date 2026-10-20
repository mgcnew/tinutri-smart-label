import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the original bytes, before JSON parsing or formatting. */
export function verifyClicksignHmac(
  raw: Uint8Array,
  header: string | null,
  secret: string,
): boolean {
  if (!secret || !header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(header.slice(7), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
