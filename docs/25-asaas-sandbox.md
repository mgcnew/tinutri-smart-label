# Asaas sandbox: implementação e continuidade

**Continuação atual:** o usuário aplicou os SQLs, os três métodos foram confirmados pela API sandbox e o Master ganhou conferência financeira. Consulte [Publicação e conferência Asaas](26-publicacao-e-conferencia-asaas.md), que supera os estados históricos de pendência abaixo. A entrega pública do webhook e a assinatura externa ainda precisam de homologação.

Evolução em **20/10/2026**. O usuário forneceu sua própria chave sandbox no `.env`. A linha estava sem nome de variável e foi ajustada para `ASAAS_API_KEY`, preservando o segredo. A autenticação e a consulta da carteira foram aprovadas na API sandbox. Nenhuma credencial deve aparecer em documentação, logs, capturas, frontend ou commits.

## O que está implementado

- Adaptador exclusivamente sandbox, com host fixo, timeout, redirects recusados, autenticação no servidor e erros sem conteúdo sensível da API.
- Cadastro financeiro relacionado à contratação por referência própria. Reutiliza um cadastro com a mesma referência; duplicidades exigem revisão. Notificações do cadastro criado pela integração ficam desligadas.
- Cobrança integral do ciclo e método congelados na minuta: Pix, boleto ou fatura de cartão. A aplicação não recebe números de cartão; o preenchimento ocorre na fatura hospedada no Asaas.
- Uma reserva persistente por contratação. Cliques repetidos reutilizam a fatura pronta; execução em andamento ou com resposta incerta não cria outra cobrança automaticamente. O cliente Asaas é preservado antes da cobrança.
- O ID da carteira identifica a conta usada. Trocar a chave para outra conta não reaproveita cobranças antigas silenciosamente.
- Endpoint `POST /api/webhooks/asaas`, com token próprio, limite de corpo e consulta autenticada do pagamento na API. Confere carteira, ID da cobrança, cliente financeiro, referência, valor integral, método, ambiente e contrato assinado. O valor recebido no webhook não autoriza pagamento.
- Confirmação usa a RPC idempotente do SQL 23. Em sandbox não enfileira ativação, não convida usuários e não libera acesso real. Na tela aparece explicitamente que é um teste.
- Eventos de estorno/chargeback ou exclusão consultam o estado atual na API e invalidam a confirmação sandbox. Evento de confirmação atrasado não supera estorno. A rotina não implementa suspensão comercial de usuário ativo.
- A reserva impede revogar diretamente uma contratação que pode ter cobrança aberta. Esse caso exige conferência/cancelamento no Asaas e recuperação administrativa documentada.

**Limites deliberados:** produção está bloqueada no adaptador; só `ASAAS_ENVIRONMENT=sandbox` com chave de sandbox é aceito. Renovação automática, parcelamento, assinaturas recorrentes, reativação e política de inadimplência continuam pendentes. Contrato com renovação automática não oferece checkout nesta primeira versão. Não habilitar cobrança recorrente sem definir a política comercial.

## Variáveis e SQL

Use `.env.example` como referência. Configuração exclusivamente no servidor:

```dotenv
CONTRACT_PAYMENT_PROVIDER="disabled"
ASAAS_ENVIRONMENT="sandbox"
ASAAS_API_KEY=''
ASAAS_WEBHOOK_TOKEN=""
CONTRACT_ACTIVATION_ENABLED="false"
```

A chave foi configurada no `.env` local. Foi gerado um token local independente para o webhook; seu valor não é impresso. O provedor permanece `disabled` até instalar SQL, configurar o webhook e homologar a assinatura. Não habilitar com a chave apenas.

O token do webhook deve ter entre 32 e 255 caracteres, sem espaços, e ser diferente da API key. Use aspas simples para a API key por conter `$`; no painel de segredos da hospedagem, informe o valor diretamente. Nunca use prefixo `VITE_` nas variáveis Asaas.

O `vite.config.ts` carrega o `.env` local com o parser nativo do Node antes da expansão do Vite, preservando o `$` literal da chave. Somente aspas simples não impedem a expansão feita pelo Vite. Variáveis já fornecidas pela hospedagem têm prioridade. Reiniciar o servidor local após mudar segredos. O `.env` foi removido do rastreamento do Git e incluído no `.gitignore`; o arquivo local e seus valores permanecem preservados.

Aplicar manualmente os SQLs **22 → 23 → 24**, depois dos pré-requisitos 15/19. O [SQL 24](sql/24-asaas-sandbox.sql) cria `contract_payment_checkouts` e as RPCs de reserva, preservação, bloqueio e invalidação sandbox. O pacote `npm run sql:contracting` já inclui os três arquivos na mesma transação e as conferências atualizadas. Consulte [o roteiro manual](sql/README.md). Nenhum SQL foi aplicado ao Supabase remoto nesta evolução.

## Consultar a conexão sem criar nada

```sh
npm run asaas:check
```

Lê a configuração do `.env` ou ambiente, consulta `/wallets/` e informa apenas se funcionou, sem exibir chave ou carteira. Não cria cliente, cobrança ou webhook.

## Ensaio externo opcional com dados fictícios

```sh
node --experimental-strip-types scripts/test-asaas-sandbox.mjs --create-test-payments
```

Esse comando **cria registros no sandbox**: um cliente fictício com notificações desligadas e uma fatura de teste por método. Usa CPF de exemplo da documentação oficial e e-mail `example.com`. Pix e boleto são confirmados pelo endpoint exclusivo de simulação do sandbox. A fatura de cartão é criada e consultada, mas o pagamento no checkout não é executado automaticamente. Não usa cartão real nem movimenta dinheiro real.

O relatório local em `.output/asaas-sandbox-validation.json` guarda IDs e progresso, sem segredos. Não repetir cegamente após falha: os registros externos podem ter sido criados antes de a resposta chegar. Guarde o relatório se precisar rastrear o ensaio, pois `.output` é ignorada pelo Git e pode ser removida pelo build. Os registros de teste são mantidos para conferência no sandbox; não foram vinculados ao Supabase remoto. A referência do ensaio começa com `tinutri-test:`, distinta de `tinutri:` usada pelas contratações.

## Homologar o fluxo completo

1. Instalar SQL e configurar a URL pública HTTPS da aplicação. Para testes locais de webhook, usar um túnel para a porta da aplicação.
2. Configurar a conta sandbox de assinatura eletrônica. Ainda não foi fornecida conta Clicksign; isso impede testar uma assinatura externa completa. Não forjar assinatura de um contrato real para contornar essa etapa.
3. Configurar no Asaas sandbox um webhook para `https://SEU-DOMINIO/api/webhooks/asaas`, com o mesmo token secreto do servidor. Selecionar `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` e `PAYMENT_DELETED`. Configurar entrega sequencial e acompanhar os logs no painel.
4. Habilitar `CONTRACT_PAYMENT_PROVIDER=asaas` somente no ambiente sandbox preparado. Reiniciar o servidor após alterar variáveis. Manter ativação desligada.
5. Criar minuta de renovação **manual**, com CPF/CNPJ correto no snapshot e total do plano revisado. Publicar link, concluir as duas assinaturas e preservar o PDF.
6. Na página pública, preparar e abrir a fatura de teste. Usar a simulação de pagamento exclusiva sandbox; conferir a entrega real do webhook, a consulta na API, `payment_status=confirmed` e ausência de convite/ativação.
7. Testar repetição do evento, cliques simultâneos, troca de conta, valor divergente, estorno e callback atrasado. Um evento de outra cobrança da conta deve ser ignorado. Falha transitória devolve 503 para reentrega; divergência financeira devolve 409 e exige investigação. Conferir os logs do Asaas para evitar fila pausada.

Receber 200 em `asaas:check` valida a credencial; não comprova webhook público, assinatura, pagamento no checkout de cartão ou provisionamento remoto. O ensaio externo também não substitui esse fluxo completo.

## Recuperação de preparação interrompida

Não há expiração automática da reserva. Uma resposta perdida pode esconder cliente ou fatura já criados. `preparing` e `blocked` impedem nova criação, mesmo após reinício da aplicação.

O administrador deve conferir a referência `tinutri:<UUID da contratação>` no Asaas, o ID do cliente salvo e o histórico antes de recuperar. Se a cobrança existe, preservar o vínculo correto após validar conta, método, valor e referência; não criar outra. Se for necessário cancelar, confirmar o cancelamento no Asaas antes de qualquer liberação administrativa. A versão atual não tem botão ou RPC pública que apague reservas para tentar de novo. A intervenção precisa ser específica, transacional, auditada e preservar o histórico.

## Passar para a conta do cliente

Não basta trocar a chave no `.env` nesta versão: o adaptador bloqueia produção intencionalmente. O próximo agente deve implementar a configuração e a homologação de produção, atualizar a restrição de ambiente no SQL de checkouts e conferir hosts de fatura conforme a documentação oficial.

Além da chave, configurar webhook e token próprios na conta de produção; não copiar IDs de clientes, carteira, cobranças ou contratos de sandbox. Concluir assinatura externa e homologação Supabase antes de habilitar a ativação. Recorrência, política de suspensão, estorno de acesso já ativo e renovação precisam de implementação e testes próprios. A chave do cliente não foi fornecida.

## Resultados desta evolução

Na conta sandbox fornecida, autenticação e identificação da carteira foram aprovadas. Um cliente fictício foi cadastrado com notificações desligadas. As faturas Pix, boleto e cartão foram criadas e consultadas. Pix foi confirmado pela simulação exclusiva sandbox e consultado como `RECEIVED`.

A simulação de confirmação do boleto retornou **HTTP 500 no Asaas**. A cobrança foi preservada e consultada depois como `PENDING`; não foi criada novamente. Essa confirmação precisa de nova homologação após investigar o comportamento do provedor. A fatura de cartão foi criada, mas o pagamento no checkout ainda não foi executado. A entrega pública de webhook e a assinatura externa completa continuam pendentes. Não tratar essas etapas como aprovadas.

Validação local: **81 testes do fluxo** e **9 testes de navegador** aprovados. Os testes Asaas adicionais cobrem API simulada, divergências, webhook, preparação persistente, reaproveitamento da fatura, bloqueio de repetição e invalidação sandbox. A proteção de revogação foi revalidada após a revisão final. O consolidado SQL também foi conferido em banco isolado, incluindo reaplicação e rollback integral após erro induzido. Os testes automatizados não carregam a chave real nem acessam o Supabase remoto; somente os comandos explícitos de ensaio usam a conta sandbox.

## Referências oficiais

- [Autenticação e ambientes](https://docs.asaas.com/docs/authentication-2)
- [Cadastro de clientes e referências](https://docs.asaas.com/docs/criando-um-cliente)
- [Fatura hospedada para cartão](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito)
- [Identificação da carteira](https://docs.asaas.com/reference/recuperar-walletid)
- [Eventos financeiros](https://docs.asaas.com/docs/webhook-para-cobrancas)
- [Autenticação e reentrega de webhooks](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)
- [Simulação de confirmação exclusiva sandbox](https://docs.asaas.com/reference/confirmar-pagamento)
