# Continuidade do TiNutri Smart Label

Para continuar o fluxo de contratação por link, leia:

0. `docs/26-publicacao-e-conferencia-asaas.md` — estado mais recente, resultados reais e publicação pendente.
1. `docs/23-continuar-no-claude-code.md`
2. `docs/22-contratacao-por-link.md`
3. `docs/24-ativacao-e-confiabilidade.md`
4. `docs/25-asaas-sandbox.md` — evolução atual da integração Asaas.
5. `docs/sql/README.md` — pacote SQL manual, geração offline e conferências antes/depois.

O usuário forneceu uma chave Asaas sandbox em `.env`. A primeira integração sandbox está implementada; produção do cliente fica para a etapa final. Leia o documento 25 antes de continuar. Também ainda não há conta de assinatura eletrônica. O código prepara o fluxo e o adaptador; os serviços externos precisam de configuração e homologação. Nunca simule confirmação de assinatura/pagamento em produção.

Preserve as alterações locais de `.env`; não exponha ou inclua segredos em commits. O usuário aplicou o SQL: tabelas/colunas, bucket e metadados do servidor foram confirmados pela API remota em 20/10/2026. O SQL 99 é a conferência completa de permissões/RLS. Relatórios atuais estão em `integration-state.local/`, ignorada pelo Git. A URL pública do webhook ainda retornava 404; conferir a publicação antes de habilitar a integração externa.

O código já foi enviado para `origin/main` em `11d3556` e `cc9828b`. O primeiro deploy foi bloqueado; o usuário tornou o repositório público e pediu nova tentativa. Consulte o registro mais recente do documento 26 e o status atual no GitHub/Vercel, em vez de assumir que as mudanças continuam apenas locais.
