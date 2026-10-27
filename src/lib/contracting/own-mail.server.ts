import nodemailer from "nodemailer";
import { z } from "zod";
export function ownMailConfig() {
  const local = process.env.OWN_SIGNATURE_MAIL_TRANSPORT === "local";
  const host = process.env.SIGNATURE_SMTP_HOST?.trim() ?? "";
  const port = Number(process.env.SIGNATURE_SMTP_PORT || "465");
  const from = z.string().email().parse(process.env.SIGNATURE_MAIL_FROM);
  if (local) {
    if (process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost", "::1"].includes(host))
      throw new Error("A caixa local só pode ser usada em desenvolvimento no loopback.");
  } else if (
    !host ||
    ![465, 587].includes(port) ||
    !process.env.SIGNATURE_SMTP_USER ||
    !process.env.SIGNATURE_SMTP_PASSWORD
  )
    throw new Error("Configure o SMTP da assinatura no servidor.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta SMTP inválida.");
  return { from, host, port, local };
}
export function ownMailTransport() {
  const c = ownMailConfig();
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: !c.local && c.port === 465,
    requireTLS: !c.local && c.port === 587,
    ignoreTLS: c.local,
    auth: c.local
      ? undefined
      : {
          user: process.env.SIGNATURE_SMTP_USER!,
          pass:
            c.host.toLowerCase() === "smtp.gmail.com"
              ? process.env.SIGNATURE_SMTP_PASSWORD!.replace(/\s/g, "")
              : process.env.SIGNATURE_SMTP_PASSWORD!,
        },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}
export async function sendOwnSignatureCode(input: {
  id: string;
  to: string;
  code: string;
  pdf: string;
  expires: string;
  sandbox: boolean;
}) {
  const transport = ownMailTransport();
  const { from } = ownMailConfig();
  try {
    const result = await transport.sendMail({
      from: { name: "TiNutri — Contratos", address: from },
      to: z.string().email().parse(input.to),
      messageId: `<signature-${input.id}@${from.split("@")[1]}>`,
      subject: `${input.sandbox ? "[TESTE] " : ""}Código para assinar seu contrato TiNutri`,
      text: `${input.sandbox ? "Este é um teste de assinatura, sem liberação de acesso real.\n\n" : ""}Seu código para assinar o contrato TiNutri é: ${input.code}\n\nUse-o somente na página em que você solicitou a assinatura. Não compartilhe este código.\nVálido até ${new Date(input.expires).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).\nIdentificação do PDF: ${input.pdf}\n\nSe você não solicitou este código, ignore esta mensagem.`,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("SMTP não aceitou o destinatário.");
  } catch {
    throw new Error(
      "Não foi possível confirmar o envio do código. O pedido foi preservado para recuperação.",
    );
  } finally {
    transport.close();
  }
}
