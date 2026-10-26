import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { contractingDb, MASTER, COMPANY } from "./helpers/contracting-db.mjs";
const account = "00000000-0000-4000-8000-000000000090";
const sqlFile = (name) => readFile(new URL(`../docs/sql/${name}`, import.meta.url), "utf8");
const commercial = {
  start: "activation",
  payment: "pix",
  renewal: "manual",
  plan: { cycle: "anual", months: 12, monthly_cents: 4990, total_cents: 59880 },
};
async function database() {
  const db = await contractingDb();
  // 24 e 25 antes do 29; o 29 é reaplicável.
  for (const name of ["24-asaas-sandbox.sql", "25-fila-webhooks-asaas.sql"])
    await db.exec(await sqlFile(name));
  const production = await sqlFile("29-asaas-producao.sql");
  await db.exec(production);
  await db.exec(production);
  return db;
}
async function offerIn(db, environment) {
  await db.exec(
    `reset role; set request.jwt.claim.role=''; set request.jwt.claim.sub='${MASTER}';`,
  );
  const contract = (
    await db.query(
      "insert into service_contracts(client_id,title,body,commercial_snapshot) values($1,'Contrato teste','Documento fictício de teste de pagamento',$2) returning id",
      [COMPANY, commercial],
    )
  ).rows[0].id;
  const offer = (
    await db.query(
      `insert into contract_offers(contract_id,client_id,title,body,body_sha256,company_name,commercial,signer,provider_signer,access_contact,token_hash,expires_at,signature_environment,signature_status,signed_at,signed_file_path,created_by)
   values($1,$2,'Contrato teste','Documento fictício',$3,'Teste',$4,'{}','{}',$5,$3,now()+interval '7 days',$6,'signed',now(),'test.pdf',$7) returning id`,
      [
        contract,
        COMPANY,
        randomBytes(32).toString("hex"),
        commercial,
        { name: "Responsável", email: "acesso@example.com" },
        environment,
        MASTER,
      ],
    )
  ).rows[0].id;
  await db.exec(
    "set role service_role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';",
  );
  return offer;
}
async function readyCheckout(db, offer, url) {
  const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
    .rows[0].j;
  assert.equal(claim.state, "claimed");
  await db.query("select save_contract_checkout($1,$2,'cus_prod','pay_prod',$3)", [
    offer,
    claim.worker_token,
    url,
  ]);
  return claim;
}
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];

test("produção reserva cobrança no ambiente da contratação e só aceita fatura do Asaas de produção", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "production");
    const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    assert.equal(claim.environment, "production");
    await assert.rejects(
      () =>
        db.query(
          "select save_contract_checkout($1,$2,'cus_prod','pay_prod','https://sandbox.asaas.com/i/x')",
          [offer, claim.worker_token],
        ),
      /Fatura inválida/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select save_contract_checkout($1,$2,'cus_prod','pay_prod','https://www.asaas.com.evil.example/i/x')",
          [offer, claim.worker_token],
        ),
      /Fatura inválida/,
    );
    await db.query(
      "select save_contract_checkout($1,$2,'cus_prod','pay_prod','https://www.asaas.com/i/x')",
      [offer, claim.worker_token],
    );
    assert.equal(
      (await one(db, "select claim_contract_checkout($1,$2) as j", [offer, account])).j.state,
      "ready",
    );
  } finally {
    await db.close();
  }
});

test("sandbox continua aceitando só a fatura do sandbox depois do SQL 29", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "sandbox");
    const claim = (await db.query("select claim_contract_checkout($1,$2) as j", [offer, account]))
      .rows[0].j;
    assert.equal(claim.environment, "sandbox");
    await assert.rejects(
      () =>
        db.query(
          "select save_contract_checkout($1,$2,'cus_t','pay_t','https://www.asaas.com/i/x')",
          [offer, claim.worker_token],
        ),
      /Fatura inválida/,
    );
    await db.query(
      "select save_contract_checkout($1,$2,'cus_t','pay_t','https://sandbox.asaas.com/i/x')",
      [offer, claim.worker_token],
    );
    await db.query(
      "select record_verified_contract_payment($1,$2,'pay_t','evt_t',59880,'BRL','sandbox',now())",
      [offer, account],
    );
    assert.equal((await one(db, "select count(*)::int n from contract_activation_jobs")).n, 0);
  } finally {
    await db.close();
  }
});

test("contratação sem ambiente de cobrança continua recusada", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "disabled");
    await assert.rejects(
      () => db.query("select claim_contract_checkout($1,$2)", [offer, account]),
      /elegível/,
    );
  } finally {
    await db.close();
  }
});

test("pagamento de produção verificado enfileira a ativação uma única vez", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "production");
    await readyCheckout(db, offer, "https://www.asaas.com/i/x");
    const confirm = () =>
      db.query(
        "select record_verified_contract_payment($1,$2,'pay_prod','evt_prod',59880,'BRL','production',now())",
        [offer, account],
      );
    await assert.rejects(
      () =>
        db.query(
          "select record_verified_contract_payment($1,$2,'pay_prod','evt_prod',59880,'BRL','sandbox',now())",
          [offer, account],
        ),
      /incompatível/,
    );
    await confirm();
    await confirm();
    const job = await one(db, "select status from contract_activation_jobs where offer_id=$1", [
      offer,
    ]);
    assert.equal(job.status, "pending");
    assert.equal((await one(db, "select count(*)::int n from contract_activation_jobs")).n, 1);
    assert.equal(
      (await one(db, "select claim_contract_activation($1) as j", [offer])).j.state,
      "claimed",
    );
  } finally {
    await db.close();
  }
});

test("estorno de produção invalida a prova, impede ativação pendente e alerta após liberação", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "production");
    await readyCheckout(db, offer, "https://www.asaas.com/i/x");
    await db.query(
      "select record_verified_contract_payment($1,$2,'pay_prod','evt_prod',59880,'BRL','production',now())",
      [offer, account],
    );
    await assert.rejects(
      () => db.query("select invalidate_contract_payment($1,'pay_outro')", [offer]),
      /incompatível/,
    );
    await db.query("select invalidate_contract_payment($1,'pay_prod')", [offer]);
    await db.query("select invalidate_contract_payment($1,'pay_prod')", [offer]);
    assert.equal(
      (await one(db, "select payment_status from contract_offers where id=$1", [offer]))
        .payment_status,
      "refunded",
    );
    assert.ok(
      (
        await one(
          db,
          "select invalidated_at from contract_payment_confirmations where offer_id=$1",
          [offer],
        )
      ).invalidated_at,
    );
    await assert.rejects(
      () => db.query("select claim_contract_activation($1)", [offer]),
      /elegível/,
    );
    assert.equal(
      (
        await one(
          db,
          "select count(*)::int n from contract_offer_events where offer_id=$1 and kind='payment_invalidated_after_activation'",
          [offer],
        )
      ).n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("estorno depois do acesso liberado registra alerta para o Master", async () => {
  const db = await database();
  try {
    const activated = await offerIn(db, "production");
    await readyCheckout(db, activated, "https://www.asaas.com/i/y");
    await db.query(
      "select record_verified_contract_payment($1,$2,'pay_prod','evt_prod',59880,'BRL','production',now())",
      [activated, account],
    );
    await db.exec("reset role;");
    await db.query("update contract_offers set activated_at=now() where id=$1", [activated]);
    await db.exec("set role service_role;");
    await db.query("select invalidate_contract_payment($1,'pay_prod')", [activated]);
    await db.query("select invalidate_contract_payment($1,'pay_prod')", [activated]);
    assert.ok(
      (
        await one(
          db,
          "select invalidated_at from contract_payment_confirmations where offer_id=$1",
          [activated],
        )
      ).invalidated_at,
    );
    assert.equal(
      (await one(db, "select payment_status from contract_offers where id=$1", [activated]))
        .payment_status,
      "confirmed",
    );
    assert.equal(
      (
        await one(
          db,
          "select count(*)::int n from contract_offer_events where offer_id=$1 and kind='payment_invalidated_after_activation'",
          [activated],
        )
      ).n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("fila separa notificações por ambiente e mantém a chamada antiga como sandbox", async () => {
  const db = await database();
  try {
    const hash = "b".repeat(64);
    const sandbox = (
      await one(
        db,
        "select enqueue_contract_webhook('evt_1','PAYMENT_RECEIVED','pay_1',null,$1) as j",
        [hash],
      )
    ).j;
    const production = (
      await one(
        db,
        "select enqueue_contract_webhook('evt_1','PAYMENT_RECEIVED','pay_1',null,$1,'production') as j",
        [hash],
      )
    ).j;
    assert.notEqual(sandbox.id, production.id);
    const again = (
      await one(
        db,
        "select enqueue_contract_webhook('evt_1','PAYMENT_RECEIVED','pay_1',null,$1,'production') as j",
        [hash],
      )
    ).j;
    assert.equal(again.id, production.id);
    assert.equal(
      (await one(db, "select environment from contract_webhook_inbox where id=$1", [sandbox.id]))
        .environment,
      "sandbox",
    );
    await assert.rejects(
      () =>
        db.query(
          "select enqueue_contract_webhook('evt_2','PAYMENT_RECEIVED','pay_2',null,$1,'staging')",
          [hash],
        ),
      /Ambiente inválido/,
    );
    const claim = (await one(db, "select claim_contract_webhook($1) as j", [production.id])).j;
    assert.equal(claim.environment, "production");
    await db.query("select finish_contract_webhook($1,$2,'completed','confirmed')", [
      production.id,
      claim.worker_token,
    ]);
    assert.equal(
      (await one(db, "select result_code from contract_webhook_inbox where id=$1", [production.id]))
        .result_code,
      "confirmed",
    );
  } finally {
    await db.close();
  }
});

test("navegador não executa as RPCs novas, mesmo como Master", async () => {
  const db = await database();
  try {
    const offer = await offerIn(db, "production");
    await db.exec(
      `set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${MASTER}';`,
    );
    await assert.rejects(
      () => db.query("select invalidate_contract_payment($1,'pay_prod')", [offer]),
      /permission/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select enqueue_contract_webhook('evt_x','PAYMENT_RECEIVED','pay_x',null,$1,'production')",
          ["c".repeat(64)],
        ),
      /permission/,
    );
  } finally {
    await db.close();
  }
});
