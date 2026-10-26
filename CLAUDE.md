# Continuidade do TiNutri Smart Label

**Estado atual — 24/10/2026:** assinatura própria implementada localmente, seguindo a proposta aprovada. Ler primeiro `docs/29-assinatura-propria-implementacao.md`. O usuário configurou a senha de app do Gmail em 26/10/2026; `signature:mail:check` aprovou a conexão (sem envio). Não pedir conta Clicksign/Autentique como pré-requisito e não retomar essas integrações para contratos novos.

SQLs 22–26 aplicados no projeto Supabase `ylkiyncsqubuxrtwyxwv` (também é o `project_id` de `supabase/config.toml`); em 26/10/2026 o usuário aplicou o 26 manualmente e a conferência pela API passou em 37/37. A conferência 99 completa (RLS/permissões) passou em 42/42 em 26/10/2026, pela conexão Supabase, já com o SQL 29. O código não aplica DDL remoto automaticamente. Os SQLs 27 (desempenho do `master_summary`) e 28 (RLS com `(select auth.uid())` e índices de chaves estrangeiras) foram aplicados e conferidos em 26/10/2026 (registro em `docs/sql/README.md`); as funções da Vercel passaram a ser publicadas em `gru1` via `vite.config.ts`. Não declarar entrega Gmail ou homologação real com base nos testes isolados.

A `.env` local contém credenciais reais de Supabase e Asaas sandbox e chaves da assinatura própria; preservar, nunca imprimir nem versionar. O script `signature:setup` preenche ausentes/vazios e preserva segredos; `signature:mail:check` não envia mensagens. O usuário autorizou commit/push anteriormente. Relatórios de testes/publicação ficam em `integration-state.local/`, ignorada pelo Git.

Produção Asaas da conta do cliente permanece como etapa final. Sandbox não convida nem ativa usuários reais. Manter `CONTRACT_ACTIVATION_ENABLED=false` e a assinatura em sandbox até homologar. Uma única assinatura não permite pagamento. O comprovante próprio não é certificado ICP-Brasil.

Leitura complementar:

1. `docs/30-asaas-producao-e-ativacao.md` — Asaas de produção e pagamento → ativação (26/10/2026), tudo desligado; SQL 29 aplicado e conferido em 26/10/2026. SQL 30 (QR com alérgenos, linha do tempo e conferências) aplicado em 26/10/2026.
1. `docs/28-assinatura-propria-proposta.md` — proposta aprovada; implementação no documento 29.
2. `docs/27-fila-e-estornos-asaas.md` — fila durável, SQL 25, retomada e limites.
3. `docs/26-publicacao-e-conferencia-asaas.md` — histórico de publicação e webhook.
4. `docs/25-asaas-sandbox.md`, `docs/24-ativacao-e-confiabilidade.md`.
5. `docs/23-continuar-no-claude-code.md`, `docs/22-contratacao-por-link.md` — histórico anterior à decisão de assinatura própria.
6. `docs/sql/README.md` — pacote manual 22–26, pré/pós-conferências.
