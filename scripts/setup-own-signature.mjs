// Configuração local: preserva credenciais existentes e nunca imprime segredos.
import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const file = new URL("../.env", import.meta.url);
let contents = await readFile(file, "utf8");
const has = (name) => new RegExp(`^[ \t]*(?:export[ \t]+)?${name}[ \t]*=`, "m").test(contents);
const put = (name, value) => {
  const empty = new RegExp(`^[ \t]*(?:export[ \t]+)?${name}[ \t]*=[ \t]*(?:''|""|)[ \t]*$`, "m");
  if (empty.test(contents)) contents = contents.replace(empty, `${name}='${value}'`);
  else if (!has(name)) contents += `\n${name}='${value}'\n`;
};
put("OWN_SIGNATURE_KEY_ID", "v1");
put(
  "OWN_SIGNATURE_KEYS",
  JSON.stringify({
    v1: {
      otp: randomBytes(32).toString("hex"),
      mail: randomBytes(32).toString("hex"),
      evidence: randomBytes(32).toString("hex"),
    },
  }),
);
put("OWN_SIGNATURE_PRODUCTION_ENABLED", "false");
put("OWN_SIGNATURE_MAIL_TRANSPORT", "smtp");
put("SIGNATURE_SMTP_HOST", "smtp.gmail.com");
put("SIGNATURE_SMTP_PORT", "465");
put("SIGNATURE_SMTP_USER", "tinutri50@gmail.com");
put("SIGNATURE_MAIL_FROM", "tinutri50@gmail.com");
put("SIGNATURE_SMTP_PASSWORD", "");
if (process.argv.includes("--enable-sandbox")) {
  for (const [name, value] of [
    ["CONTRACT_SIGNATURE_PROVIDER", "tinutri"],
    ["CONTRACT_SIGNATURE_ENVIRONMENT", "sandbox"],
  ]) {
    if (has(name))
      contents = contents.replace(
        new RegExp(`^[ \t]*(?:export[ \t]+)?${name}[ \t]*=.*$`, "m"),
        `${name}='${value}'`,
      );
    else put(name, value);
  }
}
await writeFile(file, contents, { mode: 0o600 });
await chmod(file, 0o600);
console.log(
  "Configuração local preparada. Segredos existentes preservados. Complete SIGNATURE_SMTP_PASSWORD com a senha de app do Gmail.",
);
console.log(
  "As chaves devem ser copiadas para a Vercel por canal privado. Não as regenere após registrar assinaturas.",
);
