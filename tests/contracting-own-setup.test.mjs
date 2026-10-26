import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const exec = promisify(execFile);
async function fixture(text, run) {
  const dir = await mkdtemp(join(tmpdir(), "tinutri-signature-setup-"));
  try {
    await mkdir(join(dir, "scripts"));
    const script = join(dir, "scripts", "setup.mjs");
    await copyFile(new URL("../scripts/setup-own-signature.mjs", import.meta.url), script);
    await writeFile(join(dir, ".env"), text);
    await run(dir, script);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("setup é idempotente e preserva chaves, senha e dólar literal do Asaas", async () =>
  fixture(
    "ASAAS_API_KEY='literal$not_a_variable'\nSIGNATURE_SMTP_PASSWORD='preserve-this-password'\nCONTRACT_SIGNATURE_PROVIDER='disabled'\n",
    async (dir, script) => {
      const first = await exec(process.execPath, [script, "--enable-sandbox"]);
      const a = await readFile(join(dir, ".env"), "utf8");
      const keyLine = a.split("\n").find((x) => x.startsWith("OWN_SIGNATURE_KEYS="));
      assert.ok(keyLine);
      assert.match(a, /ASAAS_API_KEY='literal\$not_a_variable'/);
      assert.match(a, /SIGNATURE_SMTP_PASSWORD='preserve-this-password'/);
      assert.match(a, /CONTRACT_SIGNATURE_PROVIDER='tinutri'/);
      assert.ok(!first.stdout.includes(keyLine));
      await exec(process.execPath, [script, "--enable-sandbox"]);
      const b = await readFile(join(dir, ".env"), "utf8");
      assert.equal(a, b);
      assert.equal((await stat(join(dir, ".env"))).mode & 0o777, 0o600);
    },
  ));
test("setup preenche apenas chaves vazias de um env de exemplo", async () =>
  fixture(
    "OWN_SIGNATURE_KEYS=''\nOWN_SIGNATURE_KEY_ID=''\nSIGNATURE_MAIL_FROM='existing@example.com'\n",
    async (dir, script) => {
      await exec(process.execPath, [script]);
      const data = await readFile(join(dir, ".env"), "utf8");
      const line = data.split("\n").find((x) => x.startsWith("OWN_SIGNATURE_KEYS="));
      const value = JSON.parse(line.slice("OWN_SIGNATURE_KEYS='".length, -1));
      assert.equal(value.v1.otp.length, 64);
      assert.equal(new Set(Object.values(value.v1)).size, 3);
      assert.match(data, /OWN_SIGNATURE_KEY_ID='v1'/);
      assert.match(data, /SIGNATURE_MAIL_FROM='existing@example.com'/);
    },
  ));
