# Passagem de contexto para Claude Code

**Leia primeiro o [documento 26](26-publicacao-e-conferencia-asaas.md):** o banco novo já foi aplicado pelo usuário e conferido pela API; boleto e cartão também passaram no sandbox. Há consulta ao Asaas pelo Master e setup automático do webhook. A publicação na Vercel e a conta de assinatura continuam pendentes. Os estados iniciais abaixo são históricos.

Atualizado em 20/10/2026.

## Solicitação do usuário

Preparar contratação por link: Master escolhe empresa/plano, gera contrato, compartilha link; cliente assina, paga e recebe acesso. **Deixar Asaas por último**, pois ainda não há acesso à conta. O usuário confirmou que **também não possui conta de assinatura**. Preparar o código e documentar o que falta. Não há autorização para enviar contratos ou cobranças reais a terceiros nesta etapa.

Leia primeiro [Contratação por link](22-contratacao-por-link.md) e [Ativação e confiabilidade](24-ativacao-e-confiabilidade.md). Esse documento contém instalação, regras, limitações, configuração, homologação da assinatura, recuperação de falhas e sequência da integração Asaas.

## Arquivos para começar

| Caminho                                          | Responsabilidade                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `docs/sql/23-ativacao-contratacao.sql`           | Recusas, confirmação financeira exclusiva de servidor, fila e ativação transacional |
| `src/lib/contracting/activation-flow.server.ts`  | Orquestração de convite, retomada e bloqueio, testável com portas locais            |
| `src/lib/contracting/activation.server.ts`       | Adaptador Supabase da ativação; desligado por padrão                                |
| `src/lib/contracting/webhook-handler.server.ts`  | Tratamento HTTP/HMAC/eventos testado sem contas externas                            |
| `src/lib/contracting/config.server.ts`           | Configuração de assinatura e origem do link                                         |
| `src/lib/contracting/domain.ts`                  | Validações, estados e regra para ativação                                           |
| `docs/sql/22-contratacao-por-link.sql`           | Banco, RLS, publicação, rotação e conclusão de assinatura                           |
| `src/lib/contracting/functions.ts`               | Fronteira de funções de servidor públicas e autenticadas                            |
| `src/lib/contracting/service.server.ts`          | Publicação, assinatura, leitura e downloads                                         |
| `src/lib/contracting/store.server.ts`            | Persistência de servidor, hashes, origem e configuração                             |
| `src/lib/contracting/clicksign.server.ts`        | Adaptador Clicksign v3                                                              |
| `src/lib/contracting/webhook-auth.server.ts`     | Verificação HMAC dos bytes originais                                                |
| `src/lib/contracting/webhook.server.ts`          | Recibos, deduplicação e preservação de PDF assinado                                 |
| `src/routes/api.webhooks.clicksign.ts`           | Endpoint de webhook                                                                 |
| `src/lib/contracting/payment.server.ts`          | Interface de pagamento; Asaas ainda indisponível                                    |
| `src/components/master/ContractOfferModal.tsx`   | Administração de link e representantes                                              |
| `src/components/contracting/ContractJourney.tsx` | Jornada pública de três etapas                                                      |
| `src/routes/contratar.tsx`                       | Página pública com segredo no fragmento                                             |
| `src/components/master/ContractEditor.tsx`       | Minuta com condições estruturadas                                                   |
| `src/lib/contract-template.ts`                   | Modelo de texto e início na ativação                                                |
| `.env.example`                                   | Nomes das variáveis, sem segredos                                                   |
| `tests/contracting.test.ts`                      | Domínio, HMAC, modelo e PDF                                                         |
| `tests/contracting-sql.test.mjs`                 | SQL em PGlite isolado                                                               |
| `tests/browser/contracting.*`                    | Navegador com serviços simulados                                                    |

O projeto usa React 19, TanStack Start/Router, Supabase Auth/PostgreSQL, Tailwind v4, Radix e Vite. Chamadas autenticadas usam o middleware global em `src/start.ts` e `requireSupabaseAuth`. Segredos e service role só podem ser importados em módulos `.server.ts` ou por import dinâmico dentro de handlers de servidor. Não importar esses módulos pelo topo de componentes/rotas compartilhadas.

## Estado da entrega e cuidado com mudanças locais

- Não foi aplicado SQL remoto, criada conta, enviado contrato, convite ou cobrança real.
- Assinatura e pagamento reais ainda não estão operacionais. O adaptador de assinatura foi preparado com base nas referências oficiais, mas exige homologação com a conta real.
- A rotina de ativação e provisionamento foi implementada na evolução do documento 24. Está desligada (`CONTRACT_ACTIVATION_ENABLED=false`), exige SQL 23 e confirmação financeira real, e ainda precisa de homologação com Supabase/Asaas. O gateway Asaas continua pendente.
- `.env` já tinha alterações locais antes desta implementação: não sobrescrever, imprimir ou incluir em commit.
- Também há mudanças anteriores no alerta de vencidas (`AlertCenter.tsx`, `use-alerts.ts` e `routes/index.tsx`), solicitadas pelo usuário: resumo compacto, sem lista empilhada e sem consulta de produtos. Preservar essas mudanças.
- O último commit enviado antes desse trabalho foi `3db3141`, com dropdowns da landing e link `tinutri.com.br` no rodapé. Não desfazer.
- Não assumir que os SQLs locais já foram aplicados no Supabase. Confirmar o ambiente antes de migração/publicação.

## Próximo trabalho recomendado

1. Aplicar SQLs 22 e 23, nessa ordem, em ambiente de teste, conferir variáveis de servidor e abrir uma contratação por link com fornecedor desativado.
2. Quando existir conta de assinatura, homologar o sandbox e confirmar os payloads reais; caso o fornecedor escolhido mude, substituir o adaptador mantendo as regras do domínio.
3. Quando existir acesso ao Asaas, implementar checkout e conciliação. Após verificar a API, usar `record_verified_contract_payment` e conectar a rotina `queueContractActivation` já pronta. Homologar convites, conflitos e retomada antes de habilitar produção.
4. Homologar a contratação completa antes de habilitar produção.

## Prompt sugerido para continuar

> Leia `docs/23-continuar-no-claude-code.md` e `docs/22-contratacao-por-link.md`. Continue a contratação por link sem desfazer mudanças locais. Primeiro confirme os checks e a configuração pendente. A integração de assinatura está preparada, mas sem conta e sem homologação externa. Deixe Asaas para a última etapa até eu fornecer acesso. Não marque pagamentos ou assinaturas como concluídos por simulação, não libere acesso sem confirmação e não envie documentos ou cobranças reais durante testes. Registre as decisões e resultados nestes documentos.

## Resultados de validação

Concluídos em 20/10/2026: build de produção, TypeScript, ESLint da implementação sem erros/avisos e diff sem problemas de espaços. Passaram 11 testes do novo fluxo, 13 de regressão e 5 de navegador. A UI foi verificada em 320, 375, 768 e 1440 px. Banco testado em PGlite isolado, com aplicação dupla do SQL, RLS, snapshots imutáveis, rotação de link, idempotência e exigência dos dois recibos de assinatura.

Os serviços do teste de navegador são simulados e isolados da aplicação publicada. Os payloads reais da Clicksign, credenciais, SQL remoto e contratação completa com pagamento/provisionamento ainda precisam da homologação descrita no documento 22. Não apresentar a integração externa como já homologada.

`package-lock.json` e `bun.lock` foram sincronizados com as mesmas versões. A instalação documentada e os checks foram feitos com npm. O `.env` do usuário permaneceu preservado. As mudanças não foram commitadas ou enviadas ao remoto nesta etapa.

## Evolução após esta passagem inicial

O usuário pediu continuidade no que dependesse do código. Foram concluídos tratamento de recusa/cancelamento/prazo, histórico no Master, ativação interna com preservação do usuário e confirmação/fila atômicas. Consulte o documento 24 para resultados atuais e o roteiro de recuperação. Os resultados iniciais acima são históricos; a validação ampliada está no documento 24. As mudanças continuam locais, sem commit/push ou alteração do banco remoto.

Validação ampliada concluída: 51 testes do fluxo, 7 de navegador e 13 de regressão; build, TypeScript e lint aprovados. O SQL 23 e a flag de ativação estão documentados em `docs/24-ativacao-e-confiabilidade.md`.

## Pacote SQL para aplicação futura

O usuário autorizou preparar o SQL manualmente, deixando a conexão para depois. Execute `npm run sql:contracting` para gerar o pacote offline em `.output/sql-contratacao/`. Leia [o roteiro manual](sql/README.md) e aplique as conferências antes/depois quando houver acesso. Não presuma que o SQL remoto foi instalado: isso ainda precisa ser registrado com ambiente e manifesto. Asaas continua na etapa final.

## Evolução atual: chave Asaas sandbox fornecida

O usuário adicionou sua própria chave **sandbox** ao `.env`, normalizada como `ASAAS_API_KEY`. A autenticação e identificação da carteira foram aprovadas em consulta real de leitura. Leia primeiro [Asaas sandbox](25-asaas-sandbox.md): há agora adaptador, reserva de checkout no SQL 24, UI da fatura e webhook com verificação na API. Produção continua bloqueada; assinatura externa, SQL remoto e URL pública/webhook completo continuam pendentes. Os trechos anteriores sobre ausência completa de Asaas são históricos. Não expor ou commitar `.env`; nenhuma chave está nesta documentação.
