import { z } from "zod";
import { personSchema, type Person, type ActivationErrorCode } from "./domain.ts";

const claimed = z.object({
  state: z.literal("claimed"),
  token: z.string().uuid(),
  offer_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contact: personSchema,
  user_id: z.string().uuid().nullable(),
});
const claimSchema = z.discriminatedUnion("state", [
  claimed,
  z.object({ state: z.literal("busy") }),
  z.object({ state: z.literal("completed") }),
]);
export type ActivationClaim = z.infer<typeof claimed>;
export type ActivationPorts = {
  claim: (offerId: string) => Promise<unknown>;
  candidate: (claim: ActivationClaim) => Promise<{ id: string; allowed: boolean } | null>;
  invite: (contact: Person) => Promise<string>;
  remember: (claim: ActivationClaim, userId: string) => Promise<void>;
  finish: (claim: ActivationClaim, userId: string) => Promise<void>;
  block: (claim: ActivationClaim, code: ActivationErrorCode) => Promise<void>;
};
/** Durable claim and saved account prevent repeated invitations after successful progress. */
export async function activateContract(offerId: string, ports: ActivationPorts) {
  const claim = claimSchema.parse(await ports.claim(offerId));
  if (claim.state !== "claimed") return { state: claim.state };
  let code: ActivationErrorCode = "database_unavailable";
  try {
    const account = await ports.candidate(claim);
    if (account && !account.allowed) {
      code = "account_conflict";
      throw new Error("Account cannot be assigned automatically");
    }
    let userId = account?.id;
    if (!userId) {
      // A previously reserved account disappearing must be investigated, never invited anew.
      if (claim.user_id) {
        code = "account_conflict";
        throw new Error("Reserved account unavailable");
      }
      code = "invite_uncertain";
      userId = z
        .string()
        .uuid()
        .parse(await ports.invite(claim.contact));
    }
    code = "database_unavailable";
    await ports.remember(claim, userId);
    code = "activation_unavailable";
    await ports.finish(claim, userId);
    return { state: "completed" as const };
  } catch {
    // If persisting the block fails, leave the durable processing lock for operator review.
    await ports.block(claim, code);
    return { state: "blocked" as const, code };
  }
}
