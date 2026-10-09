#!/usr/bin/env node
// Gera o par de chaves VAPID das notificações push. Rode na sua máquina; nada é enviado a lugar nenhum.
//   - PÚBLICA  -> VITE_VAPID_PUBLIC_KEY (.env e ambiente de publicação) e segredo VAPID_PUBLIC_KEY no Supabase
//   - PRIVADA  -> somente segredo VAPID_PRIVATE_KEY no Supabase (Edge Functions > Secrets). Não commite.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
// Chave pública no formato não comprimido: 0x04 || X || Y
const publicBytes = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);

console.log("VAPID_PUBLIC_KEY=" + b64url(publicBytes));
console.log("VAPID_PRIVATE_KEY=" + priv.d);
console.log("\nGuarde a chave privada em local seguro: quem a tiver pode enviar notificações em nome do sistema.");
