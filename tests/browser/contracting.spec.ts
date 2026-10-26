import { test, expect } from "@playwright/test";

test("contrato responsivo, leitura e solicitação de assinatura", async ({ page }, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/?scenario=pending");
  await expect(page.getByRole("heading", { name: "Confira sua contratação" })).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole("button", { name: "Continuar para assinatura" })).toBeDisabled();
    if (width === 320 || width === 1440)
      await page.screenshot({ path: testInfo.outputPath(`contract-${width}.png`), fullPage: true });
  }
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar para assinatura" }).click();
  await expect(
    page.getByText("Confira seu e-mail para abrir o link de assinatura.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar para assinatura" })).toHaveCount(0);
  expect(failures).toEqual([]);
});
test("ausência de conta de assinatura bloqueia a ação e mantém a revisão", async ({ page }) => {
  await page.goto("/?scenario=disabled");
  await expect(
    page.getByText("A assinatura eletrônica ainda não está disponível.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar contrato", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continuar para assinatura" })).toHaveCount(0);
});
test("assinatura concluída aguarda Asaas e oferece PDF assinado", async ({ page }) => {
  await page.goto("/?scenario=signed");
  await expect(page.getByRole("heading", { name: "Contrato assinado", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pagamento indisponível" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Baixar PDF assinado" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Acessar o sistema" })).toHaveCount(0);
});
test("link inválido não revela o documento e falha temporária permite retomar", async ({
  page,
}) => {
  await page.goto("/?scenario=expired");
  await expect(page.getByRole("alert")).toContainText("link está indisponível");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.goto("/?scenario=retry");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Confira sua contratação" })).toBeVisible();
});
test("pagamento sandbox oferece fatura identificada e não libera acesso real", async ({ page }) => {
  await page.goto("/?scenario=sandbox-payment");
  await expect(page.getByText("Ambiente de teste:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Preparar pagamento de teste" }).click();
  await expect(page.getByRole("link", { name: "Abrir fatura de teste" })).toHaveAttribute(
    "href",
    "https://sandbox.asaas.com/i/test-only",
  );
  await expect(page.getByRole("link", { name: "Acessar o sistema" })).toHaveCount(0);
});
test("falha de preparação informa necessidade de revisão", async ({ page }) => {
  await page.goto("/?scenario=sandbox-payment-failure");
  await page.getByRole("button", { name: "Preparar pagamento de teste" }).click();
  await expect(page.getByRole("alert")).toContainText("precisa de revisão");
  await expect(page.getByRole("link", { name: "Abrir fatura de teste" })).toHaveCount(0);
});
test("Master publica link, rotaciona e revoga com confirmação", async ({ page }) => {
  await page.goto("/?scenario=master");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const section = page.getByRole("heading", { name: "Representante da TiNutri" }).locator("..");
  await section.getByLabel("Nome completo").fill("Representante TiNutri");
  await section.getByLabel("E-mail", { exact: true }).fill("tinutri@example.com");
  await page.getByRole("checkbox", { name: /Revisei o texto/ }).check();
  await page.getByRole("button", { name: "Preparar link", exact: true }).click();
  await expect(page.getByLabel("Link para o cliente")).toHaveValue(/#a{43}$/);
  await page.getByText("Atividades recentes", { exact: true }).click();
  await expect(page.getByText("Link preparado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gerar novo link" }).click();
  await expect(page.getByLabel("Link para o cliente")).toHaveValue(/#b{43}$/);
  await page.getByRole("button", { name: "Revogar contratação", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar revogação" }).click();
  await expect(page.getByText("Link revogado", { exact: true })).toBeVisible();
});

test("assinatura recusada explica a interrupção e não oferece nova solicitação", async ({
  page,
}) => {
  await page.goto("/?scenario=refused");
  await expect(page.getByRole("status")).toContainText("Assinatura recusada");
  await expect(page.getByRole("button", { name: "Continuar para assinatura" })).toHaveCount(0);
});

test("Master acompanha bloqueio e retoma a preparação do acesso", async ({ page }) => {
  await page.goto("/?scenario=master-blocked");
  await expect(page.getByText("Ativação precisa de revisão", { exact: true })).toBeVisible();
  await expect(page.getByText("O e-mail já pertence a uma conta", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Retomar ativação" }).click();
  await expect(page.getByText("Acesso liberado", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retomar ativação" })).toHaveCount(0);
});

test("Master confere pagamento na API sem liberar usuário real", async ({ page }) => {
  await page.goto("/?scenario=master-payment");
  await expect(
    page.getByRole("button", { name: "Revogar contratação", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Conferir pagamento no Asaas" }).click();
  await expect(
    page.getByText("Pagamento de teste confirmado no Asaas.", { exact: false }),
  ).toBeVisible();
  await page.getByText("Atividades recentes", { exact: true }).click();
  await expect(page.getByText("Pagamento conferido no Asaas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retomar ativação" })).toHaveCount(0);
});

test("divergência financeira exige revisão e não confirma pagamento", async ({ page }) => {
  await page.goto("/?scenario=master-payment-mismatch");
  await page.getByRole("button", { name: "Conferir pagamento no Asaas" }).click();
  await expect(page.getByText("A cobrança precisa de revisão:", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Pagamento de teste confirmado no Asaas.", { exact: false }),
  ).toHaveCount(0);
});

test("Master consulta notificações paginadas e retoma sem liberar acesso sandbox", async ({
  page,
}) => {
  await page.goto("/?scenario=notifications");
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver notificações" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("21 notificação(ões) · Página 1")).toBeVisible();
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await expect(
    page.getByText("Pagamento de teste confirmado. Nenhum acesso real liberado.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retomar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByText("21 notificação(ões) · Página 2")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Próxima" })).toBeDisabled();
});

test("Master preserva compatibilidade antes do SQL e permite atualizar histórico", async ({
  page,
}) => {
  await page.goto("/?scenario=notifications-missing");
  await page.getByRole("button", { name: "Ver notificações" }).click();
  await expect(page.getByText("O histórico será disponibilizado", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Atualizar notificações" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("falha ao retomar notificação mantém o registro e informa o Master", async ({ page }) => {
  await page.goto("/?scenario=notifications-failure");
  await page.getByRole("button", { name: "Ver notificações" }).click();
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Serviço temporariamente indisponível.");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Retomar", exact: true })).toBeEnabled();
});

test("assinatura própria solicita código, exige aceite e registra apenas a parte cliente", async ({
  page,
}) => {
  await page.goto("/?scenario=own");
  const request = page.getByRole("button", { name: "Enviar código de assinatura" });
  await expect(request).toBeDisabled();
  await page.getByRole("checkbox").check();
  await request.click();
  await expect(page.getByText("Código enviado.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar assinatura" })).toBeDisabled();
  await page.getByLabel("Código recebido por e-mail").fill("000000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar assinatura" }).click();
  await expect(page.getByRole("alert")).toContainText("Código inválido");
  await page.getByLabel("Código recebido por e-mail").fill("482731");
  await page.getByRole("button", { name: "Confirmar assinatura" }).click();
  await expect(
    page.getByText(
      "Seu aceite foi registrado. Aguardando a assinatura do representante da TiNutri.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Acessar o sistema" })).toHaveCount(0);
});
test("falha no envio mantém pedido e não permite confirmar código não enviado", async ({
  page,
}) => {
  await page.goto("/?scenario=own-mail-failure");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enviar código de assinatura" }).click();
  await expect(
    page.getByText("O envio ainda não foi confirmado. Aguarde e atualize a situação", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Código recebido por e-mail").fill("482731");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "Confirmar assinatura" })).toBeDisabled();
});
test("Master assina sua própria parte após cliente e mantém layout responsivo", async ({
  page,
}) => {
  await page.goto("/?scenario=master-own");
  await expect(
    page.getByRole("heading", { name: "Assinatura do representante TiNutri" }),
  ).toBeVisible();
  const section = page
    .getByRole("heading", { name: "Assinatura do representante TiNutri" })
    .locator("..");
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "Enviar código de assinatura" }).click();
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await section.getByLabel("Código recebido por e-mail").fill("482731");
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "Confirmar assinatura" }).click();
  await expect(page.getByText("Assinatura concluída.", { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Assinatura do representante TiNutri" }),
  ).toHaveCount(0);
});
test("aceites preservados permitem finalizar sem pedir nova assinatura", async ({ page }) => {
  await page.goto("/?scenario=master-own-finalize");
  await expect(
    page.getByText("Os dois aceites estão registrados.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar código de assinatura" })).toHaveCount(0);
  await page.getByRole("button", { name: "Finalizar documento", exact: true }).click();
  await expect(
    page.getByText("Documento finalizado com os dois aceites preservados.", { exact: true }),
  ).toBeVisible();
});
