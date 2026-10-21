# Fila de notificações e revisão financeira — 21/10/2026

O receptor sandbox agora pode gravar a notificação antes de responder ao Asaas. A conferência continua consultando a API do provedor: o conteúdo recebido sozinho nunca confirma pagamento. A Área Master, em Contratos → Notificações de pagamento, oferece histórico recolhível, páginas de dez registros, atualização e retomada de pendências. Nenhuma destas mudanças habilita produção ou libera usuários em sandbox.

## Instalação incremental

1. No mesmo Supabase do aplicativo, executar integralmente `docs/sql/25-fila-webhooks-asaas.sql` no SQL Editor administrativo. Ele pode ser reaplicado. Os SQLs 22, 23 e 24 já foram conferidos remotamente na etapa anterior; não é necessário reaplicá-los para esta atualização.
2. Executar `docs/sql/99-conferir-contratacao.sql`, atualizado com a tabela e as três RPCs da fila. Esperar todos os resultados `OK`. Registrar data e revisão Git, sem credenciais.
3. Publicar o código e abrir a Área Master → Contratos → Ver notificações. Antes da migração, a tela informa que o histórico depende da atualização da estrutura, e o receptor preserva o processamento anterior. A ausência da RPC é detectada pelo código `PGRST202`; outros erros de banco retornam 503 para permitir reentrega.
4. Não são necessárias novas variáveis na Vercel. Manter o token do webhook e a conta sandbox já configurados, `CONTRACT_ACTIVATION_ENABLED=false` e o provedor de pagamento desabilitado até homologar a assinatura.

Para uma instalação completa, `npm run sql:contracting` gera o consolidado 22–25 em uma transação. O SQL 25 foi aplicado duas vezes e validado com RLS em PostgreSQL local isolado; isso não comprova sua aplicação remota. O registro remoto anterior não inclui esta nova tabela.

## Recebimento e recuperação

O endpoint autentica o token e limita o corpo a 1 MB. Eventos financeiros suportados são persistidos por ID único antes do retorno 200. A gravação tem timeout de seis segundos. A fila guarda somente IDs, tipo, referência própria do TiNutri, hash dos campos mínimos, contadores e resultado; não guarda token, cabeçalhos, corpo bruto, CPF ou dados do cartão.

Após persistir, `@vercel/functions.waitUntil` mantém a conferência em andamento durante a vida útil da função. O trabalhador obtém uma reserva exclusiva de três minutos. Uma execução antiga não pode concluir a reserva de uma execução nova. Eventos concluídos não repetem a confirmação; os procedimentos financeiros existentes continuam idempotentes. Reentregas incrementam o contador, e conteúdo mínimo divergente para o mesmo ID exige revisão.

Falhas temporárias ficam pendentes com intervalo mínimo de um minuto; após oito tentativas automáticas, exigem revisão. Uma nova entrega do provedor pode retomar uma pendência elegível. O Master pode retomar pendências/bloqueios e reservas expiradas; a identidade do Master fica registrada. A retomada consulta a API novamente e não permite marcar um pagamento como pago manualmente.

**Ainda não existe agendamento recorrente ou serviço autônomo de consumo da fila.** O intervalo é uma condição para a próxima tentativa, não um agendamento. Se a execução em segundo plano for interrompida e não houver reentrega, a retomada depende do Master. Antes de produção, definir cron ou consumidor durável com monitoramento; `waitUntil` continua sujeito ao tempo máximo da função na Vercel.

## Estornos, exclusões e divergências

A conferência verifica primeiro o vínculo local, o ambiente sandbox e a conta Asaas. Consulta a cobrança pelo ID armazenado, nunca por URL recebida no webhook. Estornos parciais, solicitações em andamento e contestações invalidam a comprovação financeira para impedir uso de pagamento duvidoso. A invalidação não declara que um estorno foi liquidado: a tela distingue o evento e o resultado da conferência.

Registros de estorno `DONE` ou `PENDING` com valor positivo invalidam a comprovação; `CANCELLED` isoladamente não é estorno efetivo. Estados desconhecidos exigem revisão. A verificação ocorre antes da comparação de valor, pois um estorno parcial pode alterar o valor retornado. Uma cobrança conhecida que retorna HTTP 404 na conta previamente conferida também invalida a prova; falhas de rede e outros erros não são interpretados como exclusão. Valor e forma divergentes continuam bloqueando confirmação.

O fluxo continua limitado ao primeiro ciclo integral e à renovação manual. Produção Asaas, recorrência e políticas de suspensão após estorno são etapas próprias; não são habilitadas por esta entrega.

## Validação e continuidade

Comandos relevantes:

```sh
npm run test:contracting
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/para/chrome npm run test:contracting:browser
npx tsc --noEmit
npm run build
npm run sql:contracting
```

Validação local desta atualização: 124 testes de contratação e 14 testes de navegador aprovados, TypeScript, lint dos arquivos alterados e build de produção aprovados. O bundle público foi conferido sem os segredos configurados. O consolidado 22–25 foi aplicado duas vezes e suas 28 verificações posteriores retornaram `OK` em PostgreSQL local isolado.

Os testes cobrem persistência antes do retorno, autenticação, falhas de gravação, deduplicação, reservas concorrentes/expiradas, limite de tentativas, permissões, retomada do Master, paginação responsiva, estornos e exclusão. Os testes de navegador usam componentes reais com adaptadores simulados; não comprovam login remoto ou entrega pelo Asaas.

Após aplicar o SQL e publicar, falta observar um evento financeiro real entregue pelo sandbox na nova fila e conferir seu resultado. Não criar assinaturas ou comprovações fictícias no banco remoto para atravessar etapas. A conta Clicksign ainda não foi fornecida: homologar assinatura dos dois representantes, PDF final, pagamento e só depois a configuração de produção do cliente. Ler também `docs/26-publicacao-e-conferencia-asaas.md`, `docs/25-asaas-sandbox.md` e `docs/23-continuar-no-claude-code.md`.

Referências oficiais: [limite de resposta e tratamento do webhook Asaas](https://docs.asaas.com/docs/erro-read-timed-out), [estornos](https://docs.asaas.com/docs/refunds) e [waitUntil na Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).
