export const OWN_CONSENT_VERSION = "tinutri-email-v1";
export const OWN_CONSENT =
  "Li o contrato e concordo com seus termos. Confirmo que tenho poderes para representar a parte indicada e assino eletronicamente esta versão por código enviado ao meu e-mail.";
export type OwnParty = "client" | "tinutri";
export type OwnSignatureSummary = {
  clientAccepted: boolean;
  tinutriAccepted: boolean;
  maySign: boolean;
  challenge: {
    id: string;
    expiresAt: string;
    delivery: "queued" | "sending" | "sent" | "failed" | "canceled";
  } | null;
};
