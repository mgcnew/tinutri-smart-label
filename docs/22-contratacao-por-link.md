# Contratação por link

Atualizado em **20/10/2026**. Implementação local preparada; assinatura real e pagamento dependem de contas externas. Os SQLs não foram aplicados ao ambiente remoto. A evolução de ativação e recuperação está em [Ativação e confiabilidade](24-ativacao-e-confiabilidade.md).

## O que já existe no código

- **Master → Contratos → Contratação por link:** prepara um link, define representantes e responsável pelo acesso, mostra situação, permite rotação do segredo e revogação com confirmação.
- **Página pública `/contratar#SEGREDO`:** revisão integral, resumo do plano, início após assinatura e pagamento, download do PDF, solicitação de assinatura e acompanhamento. Exibe claramente quando assinatura ou pagamento estão indisponíveis.
- **Minuta com condições estruturadas:** plano em centavos, período, forma de pagamento, renovação e início na ativação. A contratação publicada guarda cópias imutáveis desses dados e do documento. A assinatura do cliente e a assinatura da TiNutri são exigidas; o responsável pelo acesso pode ser outra pessoa.
- **Adaptador Clicksign API v3:** PDF, envelope, documento, dois signatários, requisitos de assinatura e autenticação por e-mail, ativação do envelope e envio de solicitações. O cliente assina pelo link recebido por e-mail e volta à página TiNutri. Não foi implementada assinatura incorporada em iframe.
- **Webhook `/api/webhooks/clicksign`:** valida HMAC dos bytes originais, registra comprovantes mínimos de cada representante, busca o PDF pela API autenticada e conclui a assinatura somente com os dois comprovantes. Eventos repetidos e fora de ordem são tolerados.
- **Armazenamento privado:** PDF original e PDF assinado; download assinado exige o segredo válido da contratação e usa URL de curta duração.
- **Ativação preparada:** fila persistente, convite Supabase, vínculo como administrador da própria empresa e conclusão transacional. Permanece desativada e só aceita confirmação financeira de servidor, em produção e com o valor integral do ciclo.
- **Histórico no Master:** eventos recentes, motivo de recusa/cancelamento/expiração e situação da preparação do acesso.
- **Fronteira de pagamento:** `payment.server.ts` define o contrato esperado do gateway. A implementação de checkout permanece indisponível, conforme solicitado.

A publicação não envia mensagens por conta própria. O Master copia o link e o compartilha pelo canal combinado. Os e-mails da Clicksign só são solicitados quando o cliente aciona “Continuar para assinatura”, com o fornecedor configurado.

## O que ainda não está operacional

1. Não há conta Clicksign nem credenciais fornecidas; a integração externa **não foi homologada**. Os testes locais usam dados e serviços simulados em ambiente separado. Não há botão de “simular assinatura” em produção.
2. Asaas possui agora uma primeira integração exclusivamente sandbox: fatura do ciclo integral, renovação manual, reserva persistente e webhook com consulta na API. A versão atual e os limites estão em [Asaas sandbox](25-asaas-sandbox.md). Produção, recorrência e suspensão continuam pendentes.
3. A rotina de ativação e provisionamento já está implementada e testada localmente, mas **permanece desligada e sem a fonte Asaas**. A conexão ao pagamento e a homologação do convite real ficam na etapa final. Abrir ou assinar um link não libera acesso. As regras autoritativas estão no SQL 23; `canActivate` é apenas uma verificação preliminar de estado.
4. Não há envio automático do link inicial por WhatsApp/e-mail nem lembretes de abandono.
5. Não há fluxo de cancelamento financeiro, reembolso, inadimplência ou renovação em operação. A seleção de renovação no contrato registra a condição comercial; não cria débitos recorrentes.
6. O acesso manual existente às empresas não é alterado por esta entrega. Para o novo onboarding, ainda será necessário ligar a ativação ao pagamento e tratar empresas novas como pendentes até lá.

## Instalação

1. Instalar dependências: `npm ci`.
2. Conferir que os SQLs [15](sql/15-area-master.sql) e [19](sql/19-assinaturas-contratos.sql) já estão aplicados.
3. Executar [SQL 22](sql/22-contratacao-por-link.sql) e depois [SQL 23](sql/23-ativacao-contratacao.sql) no editor administrativo do Supabase. Os scripts são reaplicáveis e não mudam os contratos ou acessos existentes. Criam tabelas, RPCs, índices e o bucket privado `contract-documents`, e adicionam `commercial_snapshot` às minutas. O SQL 23 exige que não existam contratações de adesão concorrentes para a mesma empresa; o documento 24 explica a conferência. Faça isso antes de usar o novo gerador em produção.
4. Configurar as variáveis de servidor descritas abaixo; nunca usar prefixo `VITE_` para segredos.
5. Publicar a aplicação somente após os testes do ambiente correspondente.

Os scripts de banco são de aplicação manual, seguindo o padrão dos documentos 15 e 19; não foi criado um segundo arquivo de migração duplicado em `supabase/migrations`.

| Variável                                   | Uso                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Autenticação de funções do Master                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`                | Operações de servidor, documentos privados e webhook; nunca expor ao cliente                                   |
| `CONTRACT_PUBLIC_ORIGIN`                   | Origem HTTPS da aplicação, sem caminho. Local aceita localhost/127.0.0.1 fora de produção                      |
| `CONTRACT_SIGNATURE_PROVIDER`              | `disabled` por padrão; `clicksign` para conectar a conta                                                       |
| `CONTRACT_SIGNATURE_ENVIRONMENT`           | `sandbox` por padrão; `production` somente após homologação                                                    |
| `CLICKSIGN_ACCESS_TOKEN`                   | Access Token da conta e do ambiente escolhido                                                                  |
| `CLICKSIGN_WEBHOOK_SECRET`                 | HMAC SHA256 Secret do webhook; diferente do Access Token                                                       |
| `CONTRACT_ACTIVATION_ENABLED`              | `false` por padrão. Somente `true` após homologar pagamento, assinatura e convites; exige ambiente de produção |
| `CLICKSIGN_FILE_HOSTS`                     | Lista de hosts exatos dos arquivos assinados retornados pela API; sem protocolos ou curingas                   |

Não é necessário preencher variáveis do Asaas agora. Na evolução posterior, o usuário forneceu uma chave sandbox no `.env`, normalizada como `ASAAS_API_KEY`; seu valor nunca deve ser documentado. Consulte o documento 25.

## Preparar uma contratação

1. Conferir empresa e plano no cadastro comercial.
2. Gerar uma nova minuta: marcar início do período após assinatura e pagamento, definir forma de pagamento e renovação, completar os dados da TiNutri, suporte e demais campos.
3. Revisar o documento e salvar. Não pode haver marcadores `[PENDENTE: ...]` para publicar um link.
4. Abrir “Contratação por link”, informar os dois representantes e, se necessário, outro responsável pelo acesso.
5. Confirmar a revisão, escolher prazo de 3, 7, 15 ou 30 dias e preparar o link.
6. Copiar o link. O segredo completo não fica armazenado no banco; reabertura oferece rotação para gerar outro link e invalidar o anterior.

Minutas antigas são preservadas e podem continuar sendo revisadas. Para contratar por link, gere uma nova com as condições estruturadas. Edições manuais no corpo não alteram o preço/forma de pagamento estruturados; a revisão do Master deve conferir que o texto continua correspondente ao resumo. Mudança de preço, plano, representante ou condição de uma contratação publicada exige nova minuta e nova contratação.

Arquivar uma minuta não revoga uma contratação já publicada. Use a ação específica “Revogar contratação”.

A alteração do plano da empresa entre a geração e o salvamento pode deixar o resumo incompatível com o snapshot que o banco captura. A publicação recusa essa diferença; gere novamente com o plano correto. Não tente “corrigir” um contrato já publicado.

## Estados e integridade

- Assinatura: `pending → preparing → awaiting → signed`; `failed` exige verificação antes de novo envio.
- Pagamento: `unconfigured` nesta entrega. A futura integração poderá usar `pending`, `confirmed` e `refunded`, com identificadores e horários verificáveis.
- Acesso: `activated_at` permanece vazio até a execução da rotina interna. Ela depende de assinatura completa, PDF preservado, confirmação financeira com total/moeda/ambiente correspondentes e provisionamento elegível. A fila registra `pending`, `processing`, `blocked` ou `completed`.
- `revoked_at` invalida o link e impede novas transições. O histórico permanece.
- `expires_at` limita as ações públicas. Rotacionar o segredo não altera o prazo do link nem o prazo de assinatura no provedor. Um link expirado deve ser revogado e substituído por nova contratação.
- Há uma contratação não revogada por minuta e uma adesão em aberto por empresa. O SQL 23 também impede concorrência entre minutas diferentes da mesma empresa.

O total é o valor integral do ciclo: mensal R$ 59,90; trimestral R$ 164,70; anual R$ 598,80 nos planos atuais. **A cobrança futura deve usar o snapshot da contratação**, nunca consultar o preço atual ou extrair valores do texto. Os preços históricos continuam preservados.

## Segurança e rastreabilidade

- Segredo com 32 bytes aleatórios (256 bits), apenas hash SHA-256 no banco. O fragmento `#` evita enviar o segredo na URL de navegação ou no Referer; as consultas usam POST.
- Funções públicas respondem com `Cache-Control: no-store`; página com `noindex`, `nofollow` e `no-referrer`. O service worker não guarda páginas em cache.
- Tabelas não possuem leitura anônima. Master usa autenticação Supabase e RLS. Publicação é transacional e verifica `updated_at` para impedir publicação a partir de revisão antiga.
- PDF usa o texto congelado. Caracteres que a fonte não suporta causam erro antes da publicação; não são omitidos silenciosamente. Português é suportado.
- HMAC é verificado antes de interpretar o JSON, com comparação em tempo constante. Corpo do webhook limitado a 1 MB; download limitado a 20 MB, HTTPS e hosts permitidos, sem seguir redirects.
- Webhook guarda apenas identificação do representante e hash do evento em recibos mínimos. Não registra corpos completos, IPs ou documentos pessoais em logs da aplicação.
- Conclusão exige recibo dos dois IDs e e-mails esperados e PDF obtido da API autenticada. “Fechado” isoladamente pode representar expiração/fechamento manual e não comprova ambas as assinaturas.
- Falhas retornam 5xx para permitir nova entrega do webhook. Recibos são deduplicados e conclusão é idempotente. Eventos de documentos desconhecidos são ignorados.

O link permite a leitura do contrato por quem o possuir. Compartilhe somente com o destinatário pretendido. A identidade para assinar é verificada pelo fornecedor por e-mail; a checkbox da página apenas solicita a continuidade.

## Homologação Clicksign quando a conta existir

1. Criar conta de sandbox com acesso à API v3 e gerar o Access Token.
2. Cadastrar webhook HTTPS em `/api/webhooks/clicksign` para `sign`, `auto_close`, `document_closed`, `refusal`, `cancel` e `deadline`; copiar o HMAC Secret da conta para o servidor.
3. Configurar os hosts exatos dos arquivos retornados pela API em `CLICKSIGN_FILE_HOSTS`.
4. Usar exclusivamente signatários e empresa de teste. Preparar link e solicitar assinatura.
5. Conferir na conta: um envelope, um documento, dois representantes e dois requisitos por representante (qualificação e autenticação por e-mail).
6. Capturar payloads reais **sem guardar dados pessoais no repositório** e conferir `document.key`, `event.data.signer.key`, e-mail e `links.files.signed`. A implementação segue a documentação atual; contratos de payload precisam ser confirmados com a conta real antes de produção.
7. Assinar com ambos, conferir recebimento do webhook, avanço para pagamento indisponível e download do PDF assinado. Assinatura de apenas um representante não pode avançar a etapa.
8. Repetir entregas, inverter a ordem, enviar HMAC inválido e interromper temporariamente o armazenamento. Confirmar ausência de duplicação e recuperação por reentrega.
9. Testar revogação de envelope em rascunho e documento em andamento, expiração e rotação do segredo.
10. Só depois configurar as credenciais de produção e criar uma contratação nova nesse ambiente. O ambiente de uma contratação publicada é imutável; não converter sandbox em produção.

Referências oficiais usadas: [fluxo API v3](https://developers.clicksign.com/docs/veja-como-funciona-na-pr%C3%A1tica), [segurança do webhook](https://developers.clicksign.com/docs/seguranca-de-webhooks), [evento sign](https://developers.clicksign.com/docs/evento-sign), [evento document_closed](https://developers.clicksign.com/docs/evento-document-closed), [listagem de documentos](https://developers.clicksign.com/reference/api-listar-documentos), [cancelamento do documento](https://developers.clicksign.com/reference/editar-documento).

## Recuperação de envio interrompido

`preparing` é uma trava persistente para impedir duplicação. `failed` não volta automaticamente a `pending`: um timeout pode significar que a Clicksign já recebeu a operação.

- Verificar `provider_envelope_id`, `provider_document_id`, os dois IDs de signatário, a pasta `original.pdf` e a trilha de eventos pelo servidor/admin.
- Procurar no provedor pelo nome do envelope, que inclui o UUID da contratação, inclusive se a resposta de criação se perdeu antes de salvar o ID.
- Se o envio chegou ao provedor, preservar o envelope e reentregar os webhooks faltantes; para envio não concluído, verificar/cancelar o envelope antes de preparar outra contratação.
- Se o processo ficou em `preparing`, não destravar por conta de um novo clique. Confirmar que a requisição original terminou e, por operação administrativa auditada, mudar para `failed` para permitir o cancelamento. Não existe destravamento automático por tempo porque isso poderia criar dois envios.
- Se a notificação falhou após ativar o envelope, conferir o envio na conta Clicksign e reenviar por lá. Não criar outro envelope apenas para reenviar e-mail.
- Se o arquivo não foi salvo, restaurar storage/hosts e reentregar o evento. O estágio só muda para assinado após preservar o PDF.

## Asaas — roteiro original e continuidade de produção

O roteiro abaixo é o planejamento original. A primeira integração **sandbox** de cliente, fatura, reserva e webhook já foi implementada conforme o [documento 25](25-asaas-sandbox.md). Os itens de produção e recorrência continuam pendentes.

1. Ler esta documentação e [passagem de contexto](23-continuar-no-claude-code.md). Não usar `clients.subscription_status` manual como prova de pagamento.
2. Confirmar conta, ambiente, meios de pagamento, política de renovação, cancelamento e início do ciclo. O usuário forneceu sua chave sandbox; a chave de produção do cliente continua pendente.
3. Revisar a integração sandbox em `src/lib/contracting/payment.server.ts`, usando `offer.id` como referência externa e chave estável de idempotência. Se o provedor não garantir idempotência na operação escolhida, usar reserva transacional local e consulta por referência antes de repetir.
4. Criar checkout **somente depois de assinatura completa**, a partir do total em centavos, período e método imutáveis. Nunca aceitar valor enviado pelo navegador. Recorrência somente quando contratada; renovação manual não deve gerar assinatura recorrente silenciosamente.
5. Persistir os IDs do cliente/cobrança/assinatura do provedor, ambiente, referência externa, moeda e valor esperado. Adicionar tabela de eventos financeiros com chave única por evento para conciliação idempotente.
6. Receber webhook autenticado, conferir na API o pagamento, conta, ambiente, referência, valor e situação elegível por meio de pagamento. Retorno do checkout e simples criação de boleto/Pix não autorizam acesso.
7. Usar a RPC exclusiva `record_verified_contract_payment` do SQL 23: registra confirmação, atualiza o estado financeiro e enfileira a ativação na mesma transação. É chamada somente após validação na API do provedor; não é uma API para aceitar declarações do cliente. A reentrega não duplica a confirmação/fila.
8. Conectar `queueContractActivation(offer.id)` depois dessa gravação. A função enfileira de forma idempotente e processa somente quando `CONTRACT_ACTIVATION_ENABLED=true` e o ambiente é produção. O processamento já convida novos responsáveis, preserva o ID retornado e finaliza os vínculos pelo SQL 23.
9. Conferir conflitos de conta e a política de empresas suspensas. A implementação bloqueia transferência de outra empresa, alteração de Master e promoção automática de gerente/operador já vinculado. A exceção ao guard do SQL 19 é estreita, exclusiva da RPC verificada; não abre edição geral de assinaturas ao servidor ou ao cliente.
10. Homologar convite, criação de senha, reentrega e recuperação com Supabase real. A operação de convite não participa da transação PostgreSQL; uma resposta perdida exige revisão para evitar duplicação. Administradores existentes da mesma empresa usam seu acesso habitual. Comunicação adicional de boas-vindas pode ser implementada à parte.
11. Conectar a UI de pagamento e de acesso e homologar Pix, cartão, boleto, duplicação, atraso de webhook, assinatura incompleta, falha de provisionamento, estorno e cancelamento.
12. Depois implementar renovação, avisos de atraso, suspensão com política definida e reativação. Suspensão comercial e revogação do link não devem apagar registros operacionais.

As tabelas já possuem `payment_provider_id`, `payment_status`, `paid_at`, `activated_at`, a confirmação financeira e a fila de provisionamento. A integração financeira ainda poderá exigir campos próprios de cliente/cobrança/assinatura e conciliação de recorrência. Não tratar essa estrutura inicial como um sistema financeiro concluído.

Referências para consultar novamente na integração: [Asaas — assinaturas](https://docs.asaas.com/docs/assinaturas), [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas), [checkout](https://docs.asaas.com/docs/eventos-para-checkout).

## Verificação local

Comandos reproduzíveis:

```sh
npm run test:contracting
npx playwright install chromium
npm run test:contracting:browser
npx tsc --noEmit
npm run build
```

O ensaio de banco usa PGlite isolado, papéis anon/autenticado/service_role, um Master fictício e tabelas mínimas. Não conecta ao Supabase. O ensaio de navegador sobe uma aplicação Vite de teste na porta 8083, usa os componentes reais com um módulo de serviços simulado e não utiliza contas reais. Não há fixture publicada na rota `/contratar`.

Resultados da preparação inicial em 20/10/2026 (a validação ampliada está no documento 24):

- 11 testes do novo fluxo passaram (domínio, HMAC, modelo, PDF e SQL isolado).
- 13 testes de regressão passaram (valores dos planos, datas, gerador anterior e alertas).
- 5 testes de navegador passaram; página pública e modal do Master conferidos em 320, 375, 768 e 1440 px sem transbordamento horizontal. Capturas em `.output/contracting-browser` são locais e ignoradas pelo Git.
- TypeScript sem erros; ESLint dos arquivos da implementação sem erros ou avisos; build de produção aprovado; `git diff --check` aprovado.
- Endpoint local de webhook, com integração desativada, respondeu indisponibilidade sem acessar o provedor.
- Pacote público do build conferido sem nomes/implementações de credenciais do serviço de assinatura ou service role.
- `package-lock.json` atualizado; `bun.lock` regenerado a partir do lock do npm para usar as mesmas versões. As dependências novas são `pdf-lib` em execução, e PGlite/Playwright para testes.

Esses ensaios não validam conta Clicksign, payloads reais, envio/assinatura externa, Supabase remoto, Asaas ou provisionamento remoto. A validação ampliada do provisionamento local está no documento 24. Nenhuma mensagem, documento ou cobrança real foi enviada.
