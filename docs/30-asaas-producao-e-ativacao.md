# Asaas de produção e ativação automática

Atualizado em **26/10/2026**. Implementação local da Fase 2: cobrança Asaas de produção ao lado do sandbox e ligação do pagamento verificado à ativação do acesso. **Tudo começa desligado.** Nenhuma cobrança real, convite ou ativação foi feito nesta etapa. O SQL 29 foi aplicado e conferido no Supabase em 26/10/2026 (registro em `docs/sql/README.md`).

## O que mudou

- **Ambiente da cobrança = ambiente da contratação.** Uma contratação publicada em `production` usa a conta Asaas de produção; uma `sandbox` usa o sandbox. O valor nunca vem do navegador. Contratação `disabled` continua sem cobrança.
- **Configuração própria de produção:** `ASAAS_PRODUCTION_ENABLED=true`, `ASAAS_PRODUCTION_API_KEY` (chave `$aact_prod_`) e `ASAAS_PRODUCTION_WEBHOOK_TOKEN`. Sem as três, produção é recusada pelo servidor; o sandbox (`ASAAS_API_KEY`, `ASAAS_ENVIRONMENT=sandbox`, `ASAAS_WEBHOOK_TOKEN`) não muda.
- **Hosts fixos:** API `https://api.asaas.com/v3` e fatura somente em `https://www.asaas.com` para produção; `api-sandbox`/`sandbox.asaas.com` para teste. O SQL 29 confere o domínio da fatura pelo ambiente gravado na cobrança.
- **Webhook:** o mesmo endereço `/api/webhooks/asaas` atende as duas contas. O **token recebido decide o ambiente** (comparação em tempo constante); os tokens precisam ser diferentes entre si e das chaves. A fila (SQL 25) grava o ambiente e a retomada o reutiliza. Notificação da conta sandbox nunca confirma contratação de produção, e vice-versa.
- **Pagamento → ativação:** depois da conferência na API (conta, cliente, referência, valor integral, método, contrato assinado), `record_verified_contract_payment` grava a prova e, em produção, já enfileira a ativação na mesma transação (SQL 23). Em seguida o servidor chama `queueContractActivation`: com `CONTRACT_ACTIVATION_ENABLED=true` e `CONTRACT_SIGNATURE_ENVIRONMENT=production`, convida o responsável pelo acesso e conclui a ativação; desligada, a fila fica `pending` e o Master usa **Retomar ativação** depois. Falha na ativação não desfaz a confirmação financeira.
- **Estorno/contestação em produção:** `invalidate_contract_payment` invalida a prova; uma ativação pendente deixa de ser elegível. Se o acesso **já foi liberado**, a contratação mantém a situação (o SQL 22 exige pagamento confirmado para contratos ativados) e recebe o alerta **"Pagamento invalidado após a liberação: revisar o acesso"**. Não há suspensão automática até a política comercial ser decidida.
- **Telas:** cliente e Master só falam em "teste" para contratações sandbox. O Master pode **Conferir pagamento no Asaas** em qualquer ambiente configurado e vê o resultado `confirmed` de produção.
- `npm run asaas:check -- --production` confere a chave de produção sem criar nada.

## SQL 29 (aplicação manual)

`docs/sql/29-asaas-producao.sql`, depois de 24 e 25. Amplia `contract_payment_checkouts` e `contract_webhook_inbox` para `production`, recria `claim_contract_checkout`, `save_contract_checkout`, `finish_contract_webhook` e `enqueue_contract_webhook` (agora com `p_environment`, padrão `sandbox`), e cria `invalidate_contract_payment`. Todas exclusivas de `service_role`. O sandbox segue funcionando antes e depois do SQL 29; produção depende dele. Se o SQL 24 ou 25 for reaplicado, reaplicar o 29 por último (o 25 recriaria a versão de 5 argumentos da fila).

## Testes

`npm run test:contracting` inclui `contracting-asaas-production.test.ts` (configuração, hosts, roteamento por token, fila, conferência por ambiente, gatilho da ativação) e `contracting-asaas-production-sql.test.mjs` (SQL 29 em PGlite: cobrança por ambiente, domínio da fatura, enfileiramento único, estorno antes e depois da liberação, fila separada por ambiente, permissões). Em 26/10/2026: 162 testes de contratação, 18 de navegador e TypeScript aprovados. Os testes usam serviços simulados: não comprovam conta Asaas de produção, webhook real nem convite Supabase.

## Ordem para ligar em produção

1. ~~Aplicar o SQL 29 e conferir.~~ Feito em 26/10/2026.
2. Conta Asaas de produção aprovada; gerar a chave e configurar o webhook de produção com token próprio e os mesmos eventos do sandbox, envio sequencial.
3. Na Vercel: `ASAAS_PRODUCTION_API_KEY`, `ASAAS_PRODUCTION_WEBHOOK_TOKEN`, `ASAAS_PRODUCTION_ENABLED=true`, `CONTRACT_SIGNATURE_ENVIRONMENT=production`, `OWN_SIGNATURE_PRODUCTION_ENABLED=true`, mantendo `CONTRACT_ACTIVATION_ENABLED=false`. Novo deploy.
4. Contratação real de homologação (empresa e valor da TiNutri): assinar, pagar e conferir confirmação + job `pending`, sem convite.
5. Ligar `CONTRACT_ACTIVATION_ENABLED=true`, usar **Retomar ativação** e conferir convite, senha, papel `admin_cliente` e empresa ativa. Depois testar estorno real.

Pendências fora desta etapa: política de estorno após liberação, renovação/cobrança recorrente, inadimplência, expurgo agendado de códigos de assinatura.
