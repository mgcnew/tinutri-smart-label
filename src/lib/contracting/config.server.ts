export const signatureEnvironment = () =>
  process.env.CONTRACT_SIGNATURE_ENVIRONMENT === "production"
    ? ("production" as const)
    : ("sandbox" as const);
export function signatureAvailable() {
  return (
    process.env.CONTRACT_SIGNATURE_PROVIDER === "clicksign" &&
    Boolean(
      process.env.CLICKSIGN_ACCESS_TOKEN?.trim() &&
      process.env.CLICKSIGN_WEBHOOK_SECRET?.trim() &&
      process.env.CLICKSIGN_FILE_HOSTS?.split(",").some((host) => host.trim()),
    )
  );
}
export function offerLink(token: string) {
  const base = process.env.CONTRACT_PUBLIC_ORIGIN;
  if (!base)
    throw new Error("Configure CONTRACT_PUBLIC_ORIGIN no servidor antes de preparar links.");
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("A origem da contratação deve usar HTTPS.");
  if (url.username || url.password)
    throw new Error("A origem da contratação não deve conter credenciais.");
  return `${url.origin}/contratar#${token}`;
}
