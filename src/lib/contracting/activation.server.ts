import {
  activateContract,
  type ActivationClaim,
  type ActivationPorts,
} from "./activation-flow.server";
import { offerDb, offerLink } from "./store.server";
import { z } from "zod";
export function activationAvailable() {
  return (
    process.env.CONTRACT_ACTIVATION_ENABLED === "true" &&
    process.env.CONTRACT_SIGNATURE_ENVIRONMENT === "production"
  );
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await offerDb.rpc(name, args);
  if (error) throw new Error("A ativação não pôde concluir esta etapa.");
  return data;
}
const args = (claim: ActivationClaim) => ({ p_offer: claim.offer_id, p_token: claim.token });
const ports: ActivationPorts = {
  claim: (offerId) => rpc("claim_contract_activation", { p_offer: offerId }),
  candidate: async (claim) =>
    z
      .object({ id: z.string().uuid(), allowed: z.boolean() })
      .nullable()
      .parse(await rpc("contract_access_candidate", args(claim))),
  invite: async (contact) => {
    const origin = new URL(offerLink("")).origin;
    const { data, error } = await offerDb.auth.admin.inviteUserByEmail(contact.email, {
      data: { full_name: contact.name },
      redirectTo: `${origin}/reset-password`,
    });
    if (error || !data.user) throw new Error("Não foi possível confirmar o convite.");
    return data.user.id;
  },
  remember: async (claim, userId) => {
    await rpc("remember_contract_access_user", { ...args(claim), p_user: userId });
  },
  finish: async (claim, userId) => {
    await rpc("finish_contract_activation", { ...args(claim), p_user: userId });
  },
  block: async (claim, code) => {
    await rpc("block_contract_activation", { ...args(claim), p_code: code });
  },
};
/** Call from the future verified Asaas handler, never from checkout return or browser input. */
export async function queueContractActivation(offerId: string) {
  await rpc("queue_contract_activation", { p_offer: offerId });
  if (!activationAvailable()) return { state: "queued" as const };
  return activateContract(offerId, ports);
}
export async function retryContractActivation(offerId: string) {
  if (!activationAvailable()) throw new Error("A ativação automática ainda não está habilitada.");
  return activateContract(offerId, ports);
}
