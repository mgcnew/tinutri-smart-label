# Continuidade do TiNutri Smart Label

Para continuar o fluxo de contratação por link, leia:

0. `docs/27-fila-e-estornos-asaas.md` — fila durável, SQL 25 incremental, retomada e limitações atuais.
1. `docs/26-publicacao-e-conferencia-asaas.md` — publicação e configuração do webhook concluídas.
2. `docs/23-continuar-no-claude-code.md`
3. `docs/22-contratacao-por-link.md`
4. `docs/24-ativacao-e-confiabilidade.md`
5. `docs/25-asaas-sandbox.md` — evolução atual da integração Asaas.
6. `docs/sql/README.md` — pacote SQL manual, geração offline e conferências antes/depois.

O usuário forneceu uma chave Asaas sandbox em `.env`. A primeira integração sandbox está implementada; produção do cliente fica para a etapa final. Leia o documento 25 antes de continuar. Também ainda não há conta de assinatura eletrônica. O código prepara o fluxo e o adaptador; os serviços externos precisam de configuração e homologação. Nunca simule confirmação de assinatura/pagamento em produção.

Preserve as alterações locais de `.env`; não exponha ou inclua segredos em commits. O usuário aplicou o SQL: tabelas/colunas, bucket e metadados do servidor foram confirmados pela API remota em 20/10/2026. O SQL 99 é a conferência completa de permissões/RLS. Relatórios atuais estão em `integration-state.local/`, ignorada pelo Git. A publicação e a configuração do webhook sandbox foram concluídas; home/contratação retornam 200, token inválido retorna 401 e callback autenticado sem vínculo retorna 200/ignored.

O código já foi enviado para `origin/main` em `11d3556` e `cc9828b`. O primeiro deploy foi bloqueado; o usuário tornou o repositório público e o deploy de `22aa693` foi concluído. O webhook foi configurado no Asaas e seus IDs estão preservados localmente. Consulte o estado atual do documento 26. Conta Clicksign, assinatura externa completa e entrega de evento real do provedor ainda precisam de homologação; não habilitar ativação real por causa do sucesso do sandbox.

Atualização de 21/10/2026: a nova fila depende do SQL 25, ainda sem confirmação de aplicação remota. O aplicativo detecta a ausência e mantém o receptor anterior. Não há cron de consumo; pendências podem ser retomadas pelo Master ou por reentrega. Não são necessárias novas variáveis na Vercel. A assinatura externa continua dependendo da conta Clicksign.
