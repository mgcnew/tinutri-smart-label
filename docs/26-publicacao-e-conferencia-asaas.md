# Continuidade: publicação e conferência Asaas

Atualizado em **20/10/2026**, após o usuário aplicar os SQLs e pedir continuidade.

## Publicação concluída e webhook configurado

A nova tentativa foi concluída com sucesso na Vercel após o usuário tornar o repositório público. O deployment de `22aa693` publicou o código de contratação de `cc9828b` em `https://labeltinutri.vercel.app`.

Conferências públicas realizadas:

- Home e `/contratar`: **HTTP 200**, também abertas em Chromium sem erros JavaScript.
- Webhook com token inválido: **HTTP 401**.
- Webhook autenticado com um identificador financeiro fictício, sem vínculo: **HTTP 200 / ignored** após consultar o Supabase. Nenhum registro financeiro ou usuário foi alterado.
- `npm run asaas:webhook -- --apply`: configuração sandbox criada com sucesso. A consulta posterior confirmou a URL correta, `enabled=true`, `interrupted=false`, entrega sequencial e os nove eventos financeiros esperados.

O ID da configuração está preservado em `integration-state.local/asaas-webhook.json`; o estado da publicação está em `integration-state.local/deployment-status.json`. Nenhuma chave ou token foi versionado. Os provedores de assinatura/criação de cobrança e a ativação permanecem desligados conforme o ambiente preparado; o receptor autenticado está disponível independentemente da flag de novas cobranças.

A instalação da integração Vercel nesta conversa não foi necessária para esse deploy: foi usada a publicação automática vinculada ao GitHub, depois que o usuário configurou as variáveis na hospedagem. Não repetir o bloqueio anterior como se ainda estivesse ativo.

**Ainda pendente:** configurar a conta Clicksign sandbox e homologar um contrato com as duas assinaturas, pagamento e acompanhamento do evento real enviado pelo Asaas. O teste HTTP autenticado acima valida o receptor, mas não equivale à conferência de uma entrega do provedor nos Logs de Webhooks. Nenhuma assinatura ou pagamento foi forjado para uma empresa real; produção do cliente e liberação de acesso continuam como etapas posteriores.

## Registro de publicação — atualização mais recente

O código foi enviado para `origin/main`: `11d3556` (alertas compactos) e `cc9828b` (contratação por link e Asaas sandbox). O Git estava sincronizado e sem alterações pendentes após o envio. O `.env` local e os relatórios não foram incluídos.

A primeira tentativa de produção de `cc9828b` foi bloqueada pela Vercel com `Deployment was blocked`. O usuário informou que o repositório privado era a causa e o tornou público. A visibilidade **pública** foi confirmada pela API GitHub em 20/10/2026. Esta atualização documental dispara uma nova tentativa de publicação, sem alterar o código validado. Acompanhar o status dessa tentativa antes de configurar o webhook. O endpoint público ainda retornava 404 antes deste novo envio.

As descrições de “mudanças locais” abaixo são o histórico anterior ao envio. A publicação só deve ser considerada concluída depois de conferir o deployment e as respostas HTTP do domínio público.

## Estado atual confirmado

- Os SQLs 22/23/24 estão presentes no Supabase remoto: tabelas/colunas consultadas pela API e bucket privado de PDF conferidos. A consulta de metadados também encontrou as 13 RPCs esperadas pelo servidor. Não houve alteração de registros remotos nesta conferência.
- O projeto restringe a consulta OpenAPI com a chave pública (HTTP 401), mas a chave pública é válida para a API do aplicativo. Por isso, o script não interpreta a ausência de metadados anônimos como prova de todas as permissões. O SQL 99 continua sendo a conferência completa de RLS e grants, incluindo `authenticated`.
- Pix de teste: `RECEIVED`. Boleto de teste: `RECEIVED`, após consultar e retomar a **mesma cobrança**, sem duplicá-la. Cartão de teste: `CONFIRMED`, usando o cartão fictício de aprovação na API sandbox. A falha HTTP 500 anterior do boleto foi superada no novo ensaio.
- A fatura hospedada de cartão foi aberta no navegador e a primeira etapa com cartão fictício foi conferida. O teste aprovado de pagamento foi pela API sandbox; o formulário hospedado completo ainda não foi homologado até sua confirmação final.
- Nenhum usuário real foi convidado ou ativado. Não foram criados contratos fictícios ou provas financeiras no Supabase remoto.
- Assinatura eletrônica externa continua pendente da conta Clicksign. O sandbox Asaas está autenticado, mas a criação pública de cobranças e a ativação continuam desligadas.

## URL e e-mail informados pelo usuário

- Site: `https://labeltinutri.vercel.app`
- Endpoint: `https://labeltinutri.vercel.app/api/webhooks/asaas`
- E-mail para avisos técnicos: `tinutri50@gmail.com`

Esses valores foram configurados no `.env` local como `CONTRACT_PUBLIC_ORIGIN`, `ASAAS_WEBHOOK_URL` e `ASAAS_WEBHOOK_EMAIL`, preservando as chaves.

O endpoint público foi sondado com um token inválido e retornou **HTTP 404**. A versão nova ainda não está publicada nesse endereço. O webhook não foi criado/habilitado para uma rota inexistente. A prévia da configuração no Asaas passou, sem alterar a conta.

## O que foi acrescentado no código

O Master agora vê a preparação da fatura (`preparing`, `ready`, `blocked`) e pode **Conferir pagamento no Asaas** para uma fatura sandbox pronta. A ação exige autenticação e papel Master no servidor e usa o mesmo verificador do webhook: consulta carteira e cobrança, confere referência, pagador, método, valor e assinatura; só depois confirma ou invalida a prova financeira pela RPC existente. Não existe comando de navegador para declarar um pagamento como recebido.

A ação é útil quando o webhook demora ou precisa de reentrega. Pagamento pendente continua pendente; divergência exige revisão. O evento `payment_checked` registra o responsável pela conferência. A proteção de idempotência do SQL 23 continua válida. A consulta Master pode funcionar mesmo com criação de novas cobranças desligada, desde que a credencial sandbox esteja configurada.

O receptor de webhook também foi separado da flag de criação de cobranças: uma integração autenticada pode conferir pagamentos anteriores mesmo quando o checkout está pausado. Isso não habilita cobrança nem ativação. Falhas transitórias continuam retornando 503; os estados e verificações autoritativos permanecem no servidor/banco.

O botão de revogação fica desabilitado quando existe uma preparação de cobrança. A guarda SQL correspondente já está no SQL 24. É preciso conferir/cancelar a cobrança e fazer recuperação administrativa auditada antes de revogar; não apagar reservas para forçar repetição.

## Comandos reproduzíveis

```sh
# Somente consultas: estrutura, bucket e metadados disponíveis na API.
npm run supabase:contracting:check

# Somente leitura na conta Asaas: autenticação/carteira.
npm run asaas:check

# Retoma o relatório e consulta as cobranças fictícias, sem criar nem pagar.
npm run asaas:resume

# Operações explícitas apenas sobre as cobranças fictícias existentes em sandbox.
# Consulta o estado antes; não repete pagamento confirmado.
npm run asaas:resume -- --confirm-boleto
npm run asaas:resume -- --pay-test-card

# Prévia da configuração de webhook, sem alteração da conta.
npm run asaas:webhook

# Configuração/atualização real no sandbox, somente após endpoint publicado.
npm run asaas:webhook -- --apply
```

Os relatórios agora ficam em `integration-state.local/`, ignorada pelo Git e preservada entre builds. O comando de retomada migra o relatório antigo de `.output` se necessário. São guardados IDs/progresso e carteira; não são gravadas chaves, token do webhook ou dados de cartão. Não compartilhar os arquivos indiscriminadamente. O comando de criação inicial se recusa a criar outro ensaio quando já existe relatório, direcionando para a retomada.

O setup de webhook valida domínio HTTPS público, caminho exato, e-mail e token; consulta configurações existentes e impede duplicação por conta/URL/nome. Antes de aplicar, sonda o endpoint público sem transmitir segredos e exige **HTTP 401** para o token deliberadamente inválido. Então cria ou atualiza somente a configuração correspondente e preserva o ID localmente. Não retenta POST após resposta incerta. Uma URL nova ou conta diferente de um ID já salvo exige revisão, sem sobrescrita silenciosa.

## Publicação na Vercel

A integração Vercel foi encontrada e sugerida, mas não estava instalada/autenticada nesta conversa no momento da conferência. Também não havia CLI Vercel autenticada ou vínculo local com o projeto. O último deployment de produção listado pelo GitHub para o repositório aponta para o commit anterior `3db3141`; as mudanças de contratação permaneciam locais.

Antes de publicar a versão nova, configurar no **projeto correto da Vercel** as variáveis necessárias. O `.env` local foi removido do Git e **não acompanhará o deploy**. Confirmar primeiro as variáveis de frontend já usadas pelo aplicativo para evitar depender do antigo arquivo versionado:

| Variável                         | Origem/uso                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `VITE_SUPABASE_PROJECT_ID`       | Mesmo projeto Supabase local.                                      |
| `VITE_SUPABASE_URL`              | URL pública do mesmo projeto.                                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Chave pública do projeto, nunca a de serviço.                      |
| `SUPABASE_URL`                   | Mesmo projeto no servidor.                                         |
| `SUPABASE_PUBLISHABLE_KEY`       | Chave pública usada pelo servidor.                                 |
| `SUPABASE_SERVICE_ROLE_KEY`      | Segredo do servidor, copiar diretamente para o painel de segredos. |
| `CONTRACT_PUBLIC_ORIGIN`         | `https://labeltinutri.vercel.app`                                  |
| `CONTRACT_SIGNATURE_PROVIDER`    | `disabled`, enquanto não houver conta de assinatura.               |
| `CONTRACT_SIGNATURE_ENVIRONMENT` | `sandbox`                                                          |
| `CONTRACT_PAYMENT_PROVIDER`      | `disabled` até homologar assinatura e webhook.                     |
| `ASAAS_ENVIRONMENT`              | `sandbox`                                                          |
| `ASAAS_API_KEY`                  | Chave sandbox nos segredos do servidor.                            |
| `ASAAS_WEBHOOK_TOKEN`            | Mesmo segredo próprio configurado localmente.                      |
| `ASAAS_WEBHOOK_URL`              | URL do endpoint acima.                                             |
| `ASAAS_WEBHOOK_EMAIL`            | E-mail técnico autorizado acima.                                   |
| `CONTRACT_ACTIVATION_ENABLED`    | `false`                                                            |

Preservar as demais variáveis já existentes (por exemplo, notificações push). Não colar chaves em comentários, Git, chat ou instruções de shell com valores literais. Não configurar a chave de produção do cliente nesta homologação.

Depois de configurar o ambiente, publicar/republicar a versão validada. Confirmar que a home continua acessível, `/contratar` abre a página sem expor dados sem token e `POST /api/webhooks/asaas` sem credencial válida responde 401. Se responder 503, revisar variáveis do receptor; se 404, revisar o deploy/rota. A Vercel precisa receber as variáveis antes do novo build/deploy; alterações só no `.env` local não configuram a hospedagem.

Só então executar `npm run asaas:webhook -- --apply` e homologar uma entrega pública. A flag de checkout pode continuar desligada durante essa conferência. Para o fluxo completo, configurar assinatura sandbox, assinar os dois representantes e preservar o PDF antes de preparar pagamento de uma contratação. Nunca contornar isso criando assinatura ou pagamento fictício para uma empresa real.

## Para o próximo agente

1. Ler este documento e o `CLAUDE.md` antes dos relatos históricos.
2. Verificar o estado confirmado de conexão com Vercel; se o usuário já conectou, usar a integração e não repetir o bloqueio anterior.
3. Configurar ambiente e publicar a versão validada, preservando `.env` apenas local e as alterações anteriores de alertas.
4. Conferir 401 no endpoint, aplicar setup e validar entrega real do webhook. Não marcar essa entrega como homologada somente porque a prévia passou.
5. Obter/configurar a conta Clicksign sandbox e concluir a assinatura externa. Produção Asaas, recorrência e política de inadimplência continuam como etapas próprias posteriores.

Esta evolução não exige SQL adicional além do 22/23/24 já aplicado. A consulta administrativa usa as mesmas tabelas/RPCs existentes.

## Validação desta continuação

- **101 testes do fluxo** aprovados, incluindo consulta financeira compartilhada e configuração segura do webhook (prévia, criação, atualização, duplicidade, domínio, conta divergente e resposta incerta).
- **11 testes de navegador** aprovados, incluindo a conferência financeira no Master, revisão de divergência e ausência de ativação real no sandbox.
- TypeScript, lint dos arquivos alterados e build de produção aprovados.
- Smoke HTTP local: token inválido no webhook → 401; evento de teste autenticado e ignorado → 200, sem acessar registros financeiros; home e `/contratar` → 200.
- Estrutura remota e bucket consultados sem alteração de registros. Boleto e cartão de teste confirmados na conta sandbox, conforme os relatórios locais.

Esses resultados não comprovam entrega de webhook pela internet nem assinatura externa. Essas são as próximas verificações após publicação/configuração e acesso à conta de assinatura.
