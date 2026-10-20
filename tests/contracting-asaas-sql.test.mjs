import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contractingDb, MASTER, COMPANY } from "./helpers/contracting-db.mjs";
const account = "00000000-0000-4000-8000-000000000090";
async function setup({ signature = "signed", renewal = "manual", environment = "sandbox" } = {}) {
  const db = await contractingDb();
  const sql = await readFile(new URL("../docs/sql/24-asaas-sandbox.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(`set request.jwt.claim.sub='${MASTER}';`);
  const commercial = {
    start: "activation",
    payment: "pix",
    renewal,
    plan: { cycle: "anual", months: 12, monthly_cents: 4990, total_cents: 59880 },
  };
  const contract = (
    await db.query(
      "insert into service_contracts(client_id,title,body,commercial_snapshot) values($1,'Contrato teste','Documento fictício de teste de pagamento',$2) returning id",
      [COMPANY, commercial],
    )
  ).rows[0].id;
  const offer = (
    await db.query(
      `insert into contract_offers(contract_id,client_id,title,body,body_sha256,company_name,commercial,signer,provider_signer,access_contact,token_hash,expires_at,signature_environment,signature_status,signed_at,signed_file_path,created_by)
   values($1,$2,'Contrato teste','Documento fictício',$3,'Teste',$4,'{}','{}','{}',$3,now()+interval '7 days',$5,$6,now(),'test.pdf',$7) returning id`,
      [contract, COMPANY, "a".repeat(64), commercial, environment, signature, MASTER],
    )
  ).rows[0].id;
  await db.exec(
    "set role service_role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';",
  );
  return { db, offer };
}
test("reserva persistente bloqueia clique concorrente e reutiliza fatura pronta", async () => {
  const { db, offer } = await setup();
  try {
    const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    assert.equal(claim.state, "claimed");
    assert.equal(
      (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account])).rows[0].j
        .state,
      "busy",
    );
    await assert.rejects(
      () => db.query("select save_contract_checkout($1,$2,'cus_test')", [offer, account]),
      /inválida/,
    );
    await db.query("select save_contract_checkout($1,$2,'cus_test')", [offer, claim.worker_token]);
    await db.query(
      "select save_contract_checkout($1,$2,'cus_test','pay_test','https://sandbox.asaas.com/i/test')",
      [offer, claim.worker_token],
    );
    const reused = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    assert.equal(reused.state, "ready");
    assert.equal(reused.payment_id, "pay_test");
    await assert.rejects(
      () => db.query("update contract_offers set revoked_at=now() where id=$1", [offer]),
      /encerre a cobrança/,
    );
    await assert.rejects(
      () => db.query("select claim_contract_checkout($1,$2)", [offer, MASTER]),
      /conta Asaas/,
    );
    assert.equal(
      (await db.query("select payment_status from contract_offers where id=$1", [offer])).rows[0]
        .payment_status,
      "pending",
    );
  } finally {
    await db.close();
  }
});
test("resposta incerta bloqueia criação e não reserva outra execução", async () => {
  const { db, offer } = await setup();
  try {
    const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    await db.query("select block_contract_checkout($1,$2)", [offer, claim.worker_token]);
    const next = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    assert.equal(next.state, "busy");
    assert.equal(next.status, "blocked");
  } finally {
    await db.close();
  }
});
for (const options of [
  { signature: "awaiting" },
  { renewal: "automatica" },
  { environment: "production" },
]) {
  test(`checkout não aceita ${JSON.stringify(options)}`, async () => {
    const { db, offer } = await setup(options);
    try {
      await assert.rejects(
        () => db.query("select claim_contract_checkout($1,$2)", [offer, account]),
        /elegível/,
      );
    } finally {
      await db.close();
    }
  });
}
test("RPCs não podem ser executadas pelo navegador, mesmo Master", async () => {
  const { db, offer } = await setup();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${MASTER}';`);
    await assert.rejects(
      () => db.query("select claim_contract_checkout($1,$2)", [offer, account]),
      /permission/,
    );
    await assert.rejects(
      () => db.query("update contract_payment_checkouts set status='ready'"),
      /permission/,
    );
  } finally {
    await db.close();
  }
});
test("pagamento sandbox é idempotente e estorno invalida sem ativar usuários", async () => {
  const { db, offer } = await setup();
  try {
    const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    await db.query(
      "select save_contract_checkout($1,$2,'cus_test','pay_test','https://sandbox.asaas.com/i/test')",
      [offer, claim.worker_token],
    );
    const confirm = () =>
      db.query(
        "select record_verified_contract_payment($1,$2,'pay_test','evt_test',59880,'BRL','sandbox',now())",
        [offer, account],
      );
    await confirm();
    await confirm();
    assert.equal(
      (await db.query("select count(*)::int as n from contract_payment_confirmations")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from contract_activation_jobs")).rows[0].n,
      0,
    );
    await db.query("select invalidate_sandbox_contract_payment($1,'pay_test')", [offer]);
    assert.equal(
      (await db.query("select payment_status from contract_offers where id=$1", [offer])).rows[0]
        .payment_status,
      "refunded",
    );
    await assert.rejects(confirm, /invalidada/);
  } finally {
    await db.close();
  }
});
