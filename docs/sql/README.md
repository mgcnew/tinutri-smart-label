# SQL manual da contratação por link

É possível preparar tudo sem conexão com o Supabase. O SQL cria a estrutura de contratação, assinatura e ativação; a configuração das contas externas fica para depois. Os SQLs 22–24 foram conferidos remotamente na etapa anterior; o SQL 25 é uma nova atualização, ainda sem confirmação de aplicação remota.

## Gerar o pacote local

Na raiz do repositório, com Node.js instalado:

```sh
npm run sql:contracting
```

Não exige dependências npm, `.env`, senha ou conexão. Gera os seguintes arquivos em `.output/sql-contratacao/`:

| Arquivo                       | Uso                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `00-conferir-contratacao.sql` | Consultas de pré-requisitos e conflitos; somente leitura.                      |
| `01-instalar-contratacao.sql` | SQLs 22, 23, 24 e 25 em uma única transação.                                   |
| `99-conferir-contratacao.sql` | Consultas posteriores de estrutura, RLS, permissões e bucket; somente leitura. |
| `manifest.json`               | Ordem das fontes e SHA-256 para identificar exatamente o pacote gerado.        |
| `LEIA-ME.md`                  | Cópia deste roteiro para acompanhar o pacote.                                  |

A pasta `.output` é gerada e ignorada pelo Git; pode ser removida pelo build. Gere novamente antes da aplicação e guarde uma cópia junto ao registro da instalação. Os arquivos oficiais são `docs/sql/22-contratacao-por-link.sql` `docs/sql/23-ativacao-contratacao.sql` `docs/sql/24-asaas-sandbox.sql` e `docs/sql/25-fila-webhooks-asaas.sql`; altere essas fontes e gere novamente, em vez de editar o consolidado. O gerador recusa formatos inesperados de transação.

## Quando houver acesso ao banco

1. Confirme o projeto e ambiente no painel Supabase/Lovable e tenha um backup ou ponto de restauração. Use uma sessão administrativa do SQL Editor, nunca o navegador do cliente.
2. Execute `00-conferir-contratacao.sql` e confira todos os conjuntos de resultados e as mensagens/NOTICE. A consulta não altera dados. Ela identifica dependências básicas; não certifica todo o esquema histórico do aplicativo.
3. Todos os pré-requisitos devem aparecer como `OK`. Se faltar `service_contracts` ou as colunas de assinatura de `clients`, revisar e aplicar o SQL 19. Se faltar `private.tinutri_master(uuid)`, revisar o SQL 15 antes do 19. Estes scripts pressupõem o banco existente do TiNutri; este pacote **não reconstrói um projeto vazio**. Outras tabelas/papéis ausentes exigem recuperar as migrações históricas antes de continuar.
4. Caso já existam contratações, as duas contagens de conflito precisam ser zero. Adesões concorrentes devem ser revisadas na Área Master; duplicidade de documento do provedor exige investigar sua origem. Preserve contratos e histórico. O SQL não resolve conflitos apagando registros.
5. Execute o conteúdo completo de `01-instalar-contratacao.sql`, sem selecionar trechos. Aguarde sucesso antes de continuar. A transação abrange os SQLs 22, 23, 24 e 25: erro desfaz as alterações desse arquivo. Se a sessão ficar em transação abortada, execute `ROLLBACK;`, corrija a causa e execute o arquivo inteiro novamente. Não remova constraints para contornar um erro.
6. Execute `99-conferir-contratacao.sql`. Espere todos os resultados `OK`, incluindo a mensagem do bucket. Resultado ausente, erro ou `REVISAR` precisa ser investigado antes de habilitar a integração. As consultas verificam a instalação básica; não substituem testes funcionais ou auditoria de todas as políticas.
7. Registre data, ambiente, revisão Git, manifesto usado e resultados. Não coloque credenciais, tokens ou dados de clientes nesse registro.

Alternativa: aplique manualmente os arquivos originais **22, depois 23, 24 e por último 25**, cada um completo, em vez do consolidado. Cada fonte tem sua própria transação; se o 23 falhar após o 22, o 22 continuará instalado. Corrija a causa e reaplique o 23. Se reaplicar o 19 ou o 22 depois, reaplique o **23, 24 e depois 25**, pois essas migrações substituem funções anteriores.

## Conectar o aplicativo depois

Configure as variáveis do Supabase no ambiente do servidor conforme `.env.example`, mantendo a chave de serviço exclusivamente no servidor. Não é necessário inserir chaves no SQL. Mantenha `CONTRACT_SIGNATURE_PROVIDER=disabled` e `CONTRACT_ACTIVATION_ENABLED=false` até configurar e homologar cada integração.

O bucket `contract-documents` permanece privado. A instalação não envia contrato, não cria cobrança, não convida usuário e não libera empresas automaticamente. Não execute a RPC de confirmação financeira manualmente com pagamentos fictícios: ela é chamada pelo adaptador sandbox após a conferência na API. A configuração de produção do Asaas continua como etapa final.

Após instalar, validar com a conta Master a criação da minuta e do link, mantendo os provedores desligados. Depois, homologar assinatura em sandbox, entrega de convites e pagamento verificado antes de habilitar produção. O roteiro completo está em `docs/22-contratacao-por-link.md` e `docs/24-ativacao-e-confiabilidade.md`. A evolução com a chave de teste está em `docs/25-asaas-sandbox.md`.

## Validação local do pacote

Em 20/10/2026, a pré-conferência foi executada também em banco vazio para validar o diagnóstico de dependências ausentes. O consolidado foi aplicado duas vezes em um PostgreSQL local isolado (PGlite), com os pré-requisitos do aplicativo simulados. As consultas posteriores aprovaram tabelas com RLS, colunas, índices únicos, permissões das RPCs e bucket privado. Isso não confirma instalação ou homologação no Supabase remoto.

Em 21/10/2026, o consolidado 22–25 também foi aplicado duas vezes localmente, com 28 verificações posteriores aprovadas. A API remota ainda não anuncia a tabela/RPCs do SQL 25.

## Continuidade no Claude Code

Leia `CLAUDE.md` e `docs/23-continuar-no-claude-code.md`. Informe ao próximo agente qual banco recebeu os scripts e anexe o manifesto e o resultado das conferências. Sem esse registro, deve assumir que o SQL remoto ainda está pendente. A ausência de conta Asaas ou de assinatura não impede gerar e revisar este pacote local.

## Atualização incremental da fila

Para o banco que já recebeu 22–24, executar somente `25-fila-webhooks-asaas.sql` e depois a conferência 99 atualizada. Não exige novas variáveis. Leia `docs/27-fila-e-estornos-asaas.md` para recuperação de pendências e validação posterior à publicação.
