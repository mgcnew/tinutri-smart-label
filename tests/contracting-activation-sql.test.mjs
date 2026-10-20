import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { contractingDb, MASTER, OTHER, COMPANY } from "./helpers/contracting-db.mjs";
const contact = { name: "Responsável teste", email: "access@example.com" };
const commercial = {
  start: "activation",
  payment: "pix",
  renewal: "manual",
  plan: { cycle: "anual", monthly_cents: 4990, months: 12, total_cents: 59880 },
};
async function seed(
  db,
  {
    environment = "production",
    proof = true,
    amount = 59880,
    signature = "signed",
    company = COMPANY,
    paymentStatus = "confirmed",
  } = {},
) {
  await db.exec(`reset role; set request.jwt.claim.sub='${MASTER}';`);
  const c = (
    await db.query(
      "insert into service_contracts(client_id,title,body,commercial_snapshot) values($1,'Contrato teste','Texto integral fictício para ensaio de ativação.',$2) returning id",
      [company, commercial],
    )
  ).rows[0].id;
  const id = randomUUID();
  await db.query(
    `insert into contract_offers(id,contract_id,client_id,title,body,body_sha256,company_name,commercial,signer,provider_signer,access_contact,token_hash,expires_at,signature_environment,signature_status,payment_status,signed_at,signed_file_path,payment_provider_id,paid_at,created_by)
    values($1,$2,$3,'Contrato teste','Condições de teste',$4,'Empresa de teste',$5,$6,$6,$6,$4,now()+interval '7 days',$7,$8,$11,now(),'test-only.pdf',$9,case when $11='confirmed' then now() else null end,$10)`,
    [
      id,
      c,
      company,
      "a".repeat(64),
      commercial,
      contact,
      environment,
      signature,
      `payment-${id}`,
      MASTER,
      paymentStatus,
    ],
  );
  if (proof)
    await db.query(
      "insert into contract_payment_confirmations(offer_id,provider,provider_account_id,provider_payment_id,provider_event_id,environment,amount_cents,currency,confirmed_at) values($1,'asaas','test-account',$2,$3,$4,$5,'BRL',now())",
      [id, `payment-${id}`, `event-${id}`, environment, amount],
    );
  return id;
}
const service = (db) =>
  db.exec(
    "set role service_role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';",
  );
async function claim(db, id) {
  await service(db);
  await db.query("select queue_contract_activation($1)", [id]);
  return (await db.query("select claim_contract_activation($1) as claim", [id])).rows[0].claim;
}
test("ativação rejeita estado pago sem comprovante financeiro de servidor", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db, { proof: false });
    await service(db);
    await assert.rejects(
      () => db.query("select queue_contract_activation($1)", [id]),
      /verificados/,
    );
  } finally {
    await db.close();
  }
});
for (const options of [{ environment: "sandbox" }, { amount: 4990 }, { signature: "awaiting" }]) {
  test(`ativação recusa condição inválida ${JSON.stringify(options)}`, async () => {
    const db = await contractingDb();
    try {
      const id = await seed(db, options);
      await service(db);
      await assert.rejects(
        () => db.query("select queue_contract_activation($1)", [id]),
        /verificados/,
      );
    } finally {
      await db.close();
    }
  });
}
test("Master não pode executar diretamente RPCs exclusivas de ativação", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${MASTER}';`);
    await assert.rejects(
      () => db.query("select queue_contract_activation($1)", [id]),
      /permission/i,
    );
    await assert.rejects(
      () => db.query("select * from contract_payment_confirmations"),
      /permission/i,
    );
  } finally {
    await db.close();
  }
});
test("ativação é atômica, reserva uma execução e não duplica papel ou histórico", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    const job = await claim(db, id);
    assert.equal(job.state, "claimed");
    assert.equal(
      (await db.query("select claim_contract_activation($1) as claim", [id])).rows[0].claim.state,
      "busy",
    );
    assert.equal(
      (await db.query("select contract_access_candidate($1,$2) as candidate", [id, job.token]))
        .rows[0].candidate,
      null,
    );
    await db.exec("reset role;");
    const userId = randomUUID();
    await db.query("insert into auth.users(id,email,invited_at) values($1,$2,now())", [
      userId,
      contact.email,
    ]);
    await service(db);
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, userId]);
    // Service role alone cannot use the existing manual-subscription guard as a shortcut.
    await assert.rejects(
      () =>
        db.query(
          "update clients set subscription_status='ativa',subscription_started_on=current_date where id=$1",
          [COMPANY],
        ),
      /Master/,
    );
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, randomUUID(), userId]),
      /inválida/,
    );
    await db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, userId]);
    await db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, userId]);
    const row = (await db.query("select * from contract_activation_jobs where offer_id=$1", [id]))
      .rows[0];
    assert.equal(row.status, "completed");
    assert.equal(row.user_id, userId);
    assert.equal(
      (await db.query("select client_id from profiles where user_id=$1", [userId])).rows[0]
        .client_id,
      COMPANY,
    );
    assert.deepEqual(
      (await db.query("select role from user_roles where user_id=$1", [userId])).rows.map(
        (r) => r.role,
      ),
      ["admin_cliente"],
    );
    const company = (
      await db.query(
        "select status,subscription_status,subscription_started_on from clients where id=$1",
        [COMPANY],
      )
    ).rows[0];
    assert.equal(company.status, "ativa");
    assert.equal(company.subscription_status, "ativa");
    assert.ok(company.subscription_started_on);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from contract_offer_events where offer_id=$1 and kind='access_activated'",
          [id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select claim_contract_activation($1) as claim", [id])).rows[0].claim.state,
      "completed",
    );
  } finally {
    await db.close();
  }
});
test("e-mail de Master ou usuário de outra empresa não pode ser apropriado", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    await db.query("update auth.users set email=$2 where id=$1", [OTHER, contact.email]);
    await db.query(
      "insert into profiles(user_id,client_id,name,email) values($1,null,'Conta protegida',$2)",
      [OTHER, contact.email],
    );
    await db.query("insert into user_roles(user_id,role) values($1,'admin_master')", [OTHER]);
    const job = await claim(db, id);
    assert.equal(
      (await db.query("select contract_access_candidate($1,$2) as candidate", [id, job.token]))
        .rows[0].candidate.allowed,
      false,
    );
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, OTHER]);
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, OTHER]),
      /revisão/,
    );
    assert.equal(
      (await db.query("select client_id from profiles where user_id=$1", [OTHER])).rows[0]
        .client_id,
      null,
    );
    assert.equal(
      (await db.query("select role from user_roles where user_id=$1", [OTHER])).rows[0].role,
      "admin_master",
    );
  } finally {
    await db.close();
  }
});
test("pagamento invalidado durante execução impede a liberação", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    const job = await claim(db, id);
    await db.exec("reset role;");
    const userId = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [userId, contact.email]);
    await service(db);
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, userId]);
    await db.query(
      "update contract_payment_confirmations set invalidated_at=now() where offer_id=$1",
      [id],
    );
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, userId]),
      /elegível/,
    );
    assert.equal(
      (await db.query("select activated_at from contract_offers where id=$1", [id])).rows[0]
        .activated_at,
      null,
    );
  } finally {
    await db.close();
  }
});
test("interrupção é idempotente e assinatura atrasada não ignora recusa", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db, { signature: "awaiting", proof: false });
    await db.query(
      "update contract_offers set provider_document_id='doc',provider_signer_id='one',provider_company_signer_id='two' where id=$1",
      [id],
    );
    await db.query(
      "insert into contract_signature_receipts(offer_id,signer_id,event_sha256) values($1,'one',$2),($1,'two',$3)",
      [id, "b".repeat(64), "c".repeat(64)],
    );
    await service(db);
    await db.query("select interrupt_contract_signature($1,'refused',$2)", [id, "d".repeat(64)]);
    await db.query("select interrupt_contract_signature($1,'refused',$2)", [id, "d".repeat(64)]);
    await db.query("select complete_contract_signature($1,$2,$3)", [
      id,
      `${id}/signed/${"e".repeat(64)}.pdf`,
      "e".repeat(64),
    ]);
    assert.equal(
      (await db.query("select signature_issue from contract_offers where id=$1", [id])).rows[0]
        .signature_issue,
      "refused",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from contract_offer_events where offer_id=$1 and kind='signature_refused'",
          [id],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("conta de outra empresa e promoção de gerente são recusadas", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    const different = randomUUID();
    await db.query("insert into clients(id,name,plan) values($1,'Outra empresa','mensal')", [
      different,
    ]);
    await db.query("update auth.users set email=$2 where id=$1", [OTHER, contact.email]);
    await db.query(
      "insert into profiles(user_id,client_id,name,email) values($1,$2,'Outra conta',$3)",
      [OTHER, different, contact.email],
    );
    await db.query("insert into user_roles(user_id,role) values($1,'admin_cliente')", [OTHER]);
    const job = await claim(db, id);
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, OTHER]);
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, OTHER]),
      /revisão/,
    );
    assert.equal(
      (await db.query("select client_id from profiles where user_id=$1", [OTHER])).rows[0]
        .client_id,
      different,
    );
    await db.exec("reset role;");
    await db.query("update profiles set client_id=$2 where user_id=$1", [OTHER, COMPANY]);
    await db.query("delete from user_roles where user_id=$1", [OTHER]);
    await db.query("insert into user_roles(user_id,role) values($1,'gerente')", [OTHER]);
    await service(db);
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, OTHER]),
      /revisão/,
    );
  } finally {
    await db.close();
  }
});
test("empresa suspensa não é reativada automaticamente", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    const job = await claim(db, id);
    await db.exec("reset role;");
    const userId = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [userId, contact.email]);
    await db.query("update clients set status='suspensa' where id=$1", [COMPANY]);
    await service(db);
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, userId]);
    await assert.rejects(
      () => db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, userId]),
      /suspensa/,
    );
    assert.equal(
      (await db.query("select status from clients where id=$1", [COMPANY])).rows[0].status,
      "suspensa",
    );
    assert.equal(
      (await db.query("select count(*)::int as n from profiles where user_id=$1", [userId])).rows[0]
        .n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("confirmação financeira valida total e ambiente e enfileira uma vez", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db, { proof: false, paymentStatus: "unconfigured" });
    await service(db);
    const record = (amount = 59880, environment = "production", payment = `payment-${id}`) =>
      db.query(
        "select record_verified_contract_payment($1,'test-account',$2,$3,$4,'BRL',$5,now())",
        [id, payment, `event-${id}`, amount, environment],
      );
    await assert.rejects(() => record(4990), /incompatível/);
    await assert.rejects(() => record(59880, "sandbox"), /incompatível/);
    await record();
    await record();
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from contract_payment_confirmations where offer_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from contract_activation_jobs where offer_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from contract_offer_events where offer_id=$1 and kind='payment_confirmed'",
          [id],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(() => record(59880, "production", "another-payment"), /divergente/);
    await db.query(
      "update contract_payment_confirmations set invalidated_at=now() where offer_id=$1",
      [id],
    );
    await assert.rejects(() => record(), /invalidada/);
  } finally {
    await db.close();
  }
});

test("administrador da própria empresa é reutilizado sem alterar o perfil", async () => {
  const db = await contractingDb();
  try {
    const id = await seed(db);
    await db.query("update auth.users set email=$2 where id=$1", [OTHER, contact.email]);
    await db.query(
      "insert into profiles(user_id,client_id,name,email) values($1,$2,'Nome preservado',$3)",
      [OTHER, COMPANY, contact.email],
    );
    await db.query("insert into user_roles(user_id,role) values($1,'admin_cliente')", [OTHER]);
    const job = await claim(db, id);
    assert.equal(
      (await db.query("select contract_access_candidate($1,$2) as candidate", [id, job.token]))
        .rows[0].candidate.allowed,
      true,
    );
    await db.query("select remember_contract_access_user($1,$2,$3)", [id, job.token, OTHER]);
    await db.query("select finish_contract_activation($1,$2,$3)", [id, job.token, OTHER]);
    assert.equal(
      (await db.query("select name from profiles where user_id=$1", [OTHER])).rows[0].name,
      "Nome preservado",
    );
    assert.equal(
      (await db.query("select count(*)::int as n from user_roles where user_id=$1", [OTHER]))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
