export type PaymentNotification = {
  id: string;
  event_type: string;
  status: "pending" | "processing" | "completed" | "blocked";
  result_code: string | null;
  attempts: number;
  deliveries: number;
  received_at: string;
  updated_at: string;
  locked_until: string | null;
};
export const NOTIFICATION_STATUS = {
  pending: "Aguardando conferência",
  processing: "Em conferência",
  completed: "Conferida",
  blocked: "Precisa de revisão",
} as const;
export const NOTIFICATION_EVENT: Record<string, string> = {
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_REFUNDED: "Estorno",
  PAYMENT_PARTIALLY_REFUNDED: "Estorno parcial",
  PAYMENT_REFUND_IN_PROGRESS: "Estorno em andamento",
  PAYMENT_CHARGEBACK_REQUESTED: "Contestação recebida",
  PAYMENT_CHARGEBACK_DISPUTE: "Contestação em disputa",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "Contestação em revisão",
  PAYMENT_DELETED: "Cobrança excluída",
};
export const NOTIFICATION_RESULT: Record<string, string> = {
  ignored: "Não pertence a uma contratação ativa deste sistema.",
  binding_pending: "Aguardando o vínculo da fatura.",
  account_mismatch: "A conta Asaas precisa de revisão.",
  payment_mismatch: "Os dados da cobrança divergem do contrato.",
  invalidated: "Pagamento invalidado conforme a conferência no Asaas.",
  waiting: "O pagamento ainda não foi confirmado no Asaas.",
  confirmed_sandbox: "Pagamento de teste confirmado. Nenhum acesso real liberado.",
  confirmed: "Pagamento confirmado. A liberação do acesso segue a ativação da contratação.",
  signature_required: "A assinatura precisa ser concluída e conferida.",
  retry: "A conferência não terminou. Tente retomar após verificar a disponibilidade.",
};
