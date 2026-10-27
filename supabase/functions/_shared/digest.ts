// Texto do resumo de alertas. Sem dependências, para rodar na função do Supabase e nos testes.

export type DigestInput = { expired: number; today: number; soon: number; sample: string[] };
export type Digest = { title: string; body: string; urgent: boolean; tag: string; url: string };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildDigest({ expired, today, soon, sample }: DigestInput): Digest {
  const total = expired + today + soon;
  const parts = [
    expired > 0 && count(expired, "vencida", "vencidas"),
    today > 0 && `${count(today, "vence", "vencem")} hoje`,
    soon > 0 && `${count(soon, "vence", "vencem")} em breve`,
  ].filter((part): part is string => Boolean(part));
  const names = [...new Set(sample.map((name) => name.trim()).filter(Boolean))].slice(0, 3);
  const rest = total - names.length;
  const list = names.length ? `${names.join(", ")}${rest > 0 ? ` +${rest}` : ""}` : "";
  const title =
    expired > 0
      ? `${count(expired, "etiqueta vencida", "etiquetas vencidas")}`
      : today > 0
        ? `${count(today, "etiqueta vence", "etiquetas vencem")} hoje`
        : `${count(soon, "etiqueta vence", "etiquetas vencem")} em breve`;
  const window = expired > 0 ? "expired" : today > 0 ? "today" : "all";
  return {
    title,
    body: [parts.join(" · "), list].filter(Boolean).join("\n"),
    // Vencida e "hoje" ficam na tela até alguém tocar; aviso antecipado some sozinho.
    urgent: expired > 0 || today > 0,
    tag: "tinutri-alertas",
    url: `/?painel=validades&janela=${window}`,
  };
}
