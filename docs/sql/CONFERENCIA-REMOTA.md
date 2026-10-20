# Conferência remota antes da instalação

Em **20/10/2026**, a pedido do usuário, foi testada a conexão com o Supabase usando as credenciais locais do servidor, sem exibir os valores. O identificador do projeto corresponde ao frontend. Foram realizadas exclusivamente consultas de leitura da API, com `limit=0`, sem exportar dados de clientes ou usuários.

| Verificação                                               | Resultado                                   |
| --------------------------------------------------------- | ------------------------------------------- |
| API de `clients`, `profiles`, `user_roles`                | HTTP 200                                    |
| `clients.subscription_started_on` e `subscription_status` | Presentes, HTTP 200                         |
| `service_contracts.commercial_snapshot`                   | Ausente, erro PostgreSQL `42703`            |
| `contract_offers`                                         | Não exposta/encontrada pela API, `PGRST205` |
| `contract_signature_receipts`                             | Não exposta/encontrada pela API, `PGRST205` |
| `contract_payment_confirmations`                          | Não exposta/encontrada pela API, `PGRST205` |
| `contract_activation_jobs`                                | Não exposta/encontrada pela API, `PGRST205` |
| `contract_payment_checkouts`                              | Não exposta/encontrada pela API, `PGRST205` |

A API pode ter cache de esquema; a conferência definitiva de presença, permissões e funções privadas deve ser feita com `00-conferir-contratacao.sql` no SQL Editor. Esse diagnóstico indica que a evolução 22/23/24 ainda precisa ser instalada/conferida. Nenhum SQL de instalação foi executado remotamente.

## Executar agora no painel

O pacote já está gerado em `.output/sql-contratacao/`. No SQL Editor do projeto correto, executar cada arquivo completo nesta ordem:

1. `00-conferir-contratacao.sql`: conferir pré-requisitos e contagens de conflitos conforme o README.
2. `01-instalar-contratacao.sql`: instala SQL 22, 23 e 24 em uma única transação.
3. `99-conferir-contratacao.sql`: conferir os resultados `OK`, incluindo as mensagens do bucket.

Se o pacote tiver sido removido por um build, executar `npm run sql:contracting` para recriá-lo. As fontes e instruções estão em [README.md](README.md). O consolidado não contém chaves nem dados de clientes.

As credenciais presentes nesta sessão permitem usar a API do aplicativo. Não havia conexão PostgreSQL configurada, CLI Supabase autenticada ou ferramenta de navegador conectada para usar a sessão do painel mencionada pelo usuário. A sessão autenticada no navegador do usuário não foi acessada. A aplicação de DDL exige o SQL Editor ou uma conexão administrativa apropriada; a chave `service_role` não fornece um endpoint genérico para executar esses scripts.

Depois da instalação, anotar aqui ambiente, revisão/manifesto e resultados da conferência. Até esse registro, continuar tratando a instalação remota como pendente. Manter os provedores e a ativação desligados até homologar o fluxo externo.

## Conferência após execução pelo usuário — 20/10/2026

O usuário apresentou capturas com `OK` para `public.app_role:admin_cliente` e os índices `contract_offers_company_open_idx` / `contract_offers_document_idx`. A segunda captura corresponde a um conjunto de resultados do arquivo de conferência posterior, não ao resultado direto do instalador.

Nova consulta de leitura da API confirmou HTTP 200 para `service_contracts` com `commercial_snapshot`, `contract_offers` com `signature_issue`, `contract_offer_events`, `contract_signature_receipts`, `contract_payment_confirmations`, `contract_activation_jobs` e `contract_payment_checkouts`. O bucket `contract-documents` foi encontrado privado, com limite de 20 MB e somente PDF.

Portanto, a estrutura nova está presente no projeto remoto após a execução do usuário; a situação anterior de ausência foi superada. Essas consultas não confirmam todas as permissões/RLS ou todos os conjuntos de resultados do SQL 99. Ainda conferir todos os resultados e mensagens desse arquivo, além de homologar assinatura, webhook externo e pagamento completo. Nenhuma alteração de dados, cobrança ou ativação foi feita durante esta conferência.
