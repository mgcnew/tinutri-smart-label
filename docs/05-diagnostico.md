# Diagnóstico e pontos de atenção

Este registro descreve achados do código e SQL. **Nenhuma vulnerabilidade foi explorada e nenhuma correção foi aplicada.** Prioridade indica impacto potencial para a próxima decisão, não uma comprovação de incidente em produção.

## 1. Isolamento e integridade

### SEG-01 — Usuário pode trocar sua empresa pelo próprio perfil

**Prioridade: crítica.** Fonte: migração `20260623190532`, política `Users update own profile`, e função `private.user_can_access_client`.

`authenticated` tem UPDATE de `profiles`. A política permite editar a linha cujo `user_id = auth.uid()`, sem restringir `client_id`. A função de escopo confia nesse `client_id`. Uma chamada direta à API pode alterar a empresa própria para outra empresa conhecida e passar a satisfazer regras de acesso daquele cliente. A UI não precisa oferecer essa edição para a permissão existir.

Proposta para discussão: separar atualização de nome/e-mail da gestão de vínculo, limitar colunas e centralizar mudança de empresa em operação privilegiada. Validar com duas contas de empresas diferentes em ambiente de teste.

### SEG-02 — Atualização de etiqueta é ampla

**Prioridade: alta.** Fonte: migração `20260827235744`, política `Users update label status of accessible clients`.

A política testa somente acesso ao cliente antes/depois. Não limita a mudança ao estado: caso UPDATE esteja concedido no ambiente, pode permitir alteração de validade, snapshots, autor, token, impressão e confirmação. O operador usa chamadas diretas para atualizar esses registros. A RLS também não exige empresa operacional para UPDATE.

Há uma segunda questão: o histórico SQL concede explicitamente apenas SELECT/INSERT em `issued_labels`, não UPDATE. Uma política de UPDATE não concede privilégio SQL. Default privileges ou alterações remotas podem completar esse acesso, mas não foram inspecionados. Num destino sem esse grant adicional, confirmação, baixas e contador de reimpressão podem falhar. Confirmar privilégios reais e definir simultaneamente quais colunas/transições devem ser autorizadas.

### SEG-03 — Emissão confia nas regras calculadas pelo cliente

**Prioridade: alta.** Fonte: política `Users issue labels for accessible clients`, `buildCurrentItem` e formulário de edição.

O banco valida identidade do emissor, escopo, empresa ativa, produto e responsável ativos. Não garante lote quando obrigatório, validade calculada, consistência de texto com produto/responsável, timestamp posterior à abertura ou autorização específica para prazo manual. O próprio operador pode editar prazo e dados do rascunho na UI.

Não é possível tratar os snapshots como informação validada pelo servidor. É preciso decidir a regra de negócio para sobrescritas e sua auditoria antes de implementá-la.

### SEG-04 — Eventos podem apontar para etiqueta de outra empresa

**Prioridade: alta.** Fonte: Drizzle `0000_pvps_print_confirmation`, tabela/política `label_events`.

RLS verifica acesso a `client_id`, mas não confirma se `label_id` pertence à mesma empresa. As FKs individuais também não garantem a combinação. `user_id` pode ser nulo e `user_name`, tipo e metadados são enviados pelo cliente. O log não é uma trilha imutável produzida pelo servidor.

### SEG-05 — Escopo de leitura de perfis maior que o comentário do SQL

**Prioridade: média.** Fonte: `Users view own or accessible profiles` em `20260623190532`.

O comentário fala em próprio usuário/master/admin cliente, mas a expressão permite qualquer usuário com acesso à empresa ler perfis daquele cliente. Isso inclui operadores e pode expor nomes/e-mails de toda a equipe via API. Validar se esse escopo é desejado.

### SEG-06 — Bootstrap do primeiro administrador sem trava transacional

**Prioridade: alta para instalação inicial.** Fonte: `claimFirstAdmin`, `src/lib/admin.functions.ts`.

Qualquer sessão válida pode reivindicar master se não existir nenhuma linha de papel. Verificação e gravações são separadas, sem lock/transação identificados: requisições simultâneas podem passar pela verificação. Não há e-mail administrador previamente autorizado. O problema se concentra no bootstrap ou em uma restauração incompleta de papéis.

### SEG-07 — Exposição pública e configuração de ambiente

**Prioridade: média.** Fontes: `get_label_by_token`, `.gitignore`, clientes Supabase.

Token aleatório forte é um ponto favorável. Entretanto, possuir a URL dá acesso a nome do responsável e contexto operacional. Não há expiração/rotação do token nem filtro por impressão confirmada na RPC. Decidir quais informações devem ser públicas.

`.env` está versionado; os nomes locais são de configuração e chave pública, sem service role encontrada nesse arquivo. Isso não equivale a vazamento comprovado de segredo, mas o processo atual não impede que um segredo futuro seja commitado. Há armazenamento de sessão em localStorage; não foi identificado gerenciamento explícito de CSP no código-fonte analisado.

## 2. Impressão, PVPS e rastreabilidade

### FUN-01 — PVPS limitado pelos últimos 500 registros

**Prioridade: alta.** Fonte: `refresh` consulta `issued_labels` com `.limit(500)` e `ValidadesPanel` deriva dessa mesma lista.

Uma etiqueta ativa emitida antes desse recorte desaparece do painel mesmo que ainda precise ser utilizada/descartada. Estatísticas locais também apresentam esse recorte como total. Proposta: consultar etiquetas ativas/confirmadas diretamente no banco por vencimento e paginar histórico separadamente.

### FUN-02 — Confirmação pendente pode se perder

**Prioridade: alta.** Fontes: `pendingPrint`, `dispatchPrint`, `confirmPendingPrint`.

Referências pendentes são somente estado React. Reload abandona o painel de confirmação; histórico não oferece ação explícita para confirmar uma etiqueta preparada. Nova impressão pode substituir uma confirmação ainda aberta. A confirmação limpa o estado **antes** de verificar erro; uma falha perde a referência necessária para tentar de novo.

Imprimir repetidamente não tem bloqueio de busy/idempotência. O estado de preparação, resultado físico e retomada precisam ser definidos como um fluxo persistente.

### FUN-03 — NiiMbot registra lote, exporta somente a última unidade

**Prioridade: alta.** Fonte: `dispatchPrint`, `lastLabel`, `buildNiimbotPreview`.

Todas as cópias recebem linhas e tokens, mas somente `units[units.length - 1].label` é convertido no PNG disponibilizado. A confirmação inclui todas as linhas criadas. Com múltiplas cópias/produtos, o usuário pode confirmar etiquetas cujo arquivo nunca foi disponibilizado.

### FUN-04 — Repetir impressão após falha pode reutilizar token

**Prioridade: alta.** Fontes: `retryLastPrint`, `expandUnits`, `dispatchPrint` e unique `public_token`.

Se inserção já funcionou e só depois impressão/preview falha, tentativa guarda os mesmos itens. `expandUnits` preserva o token da primeira cópia, cuja linha já existe. Nova inserção pode falhar pela unicidade. Falha na inserção inicial e falha depois da persistência precisam de tratamentos diferentes.

### FUN-05 — Modos de conexão não implementam conexão direta

**Prioridade: média.** Fonte: `PrinterSettings`, `dispatchPrint`, `printThermalBatch`.

IP, Bluetooth e USB são preferências visuais; não há uso para transportar dados. Mensagem “Impressora não encontrada” não deriva de descoberta de dispositivo. `window.print()` não confirma presença física da impressora, e erros no onload do iframe são capturados silenciosamente.

### FUN-06 — Validade diverge entre painel e QR Code

**Prioridade: alta.** Fontes: `ValidadesPanel`, `resolveStatus` e RPC.

PVPS classifica por dia e antecedência local configurável; QR usa instante e 12 horas. Uma etiqueta vencida hoje pode parecer operacionalmente diferente nos dois caminhos. Fallbacks de TIMESTAMPTZ nulo também usam horas distintas. Não há atualização automática dos estados quando o tempo passa.

### FUN-07 — Edição, duplicação e prazo zero

**Prioridade: média.** Fonte: `effectiveShelfDays`, botão Editar etiqueta e `duplicateLabel`.

Prazo digitado 0 não sobrescreve prazo positivo do produto. Ao abrir edição manual, a data de validade é inicializada com o prazo do cadastro, mesmo se o prazo da emissão já foi ajustado. Duplicação carrega datas antigas, sem restaurar hora/tipo/setor/conservação. A construção de datas vazias/inválidas pode lançar erro sem tratamento amplo no fluxo de impressão.

### FUN-08 — Baixa e eventos não são transacionais

**Prioridade: média.** Fontes: `settleLabel`, `logLabelEvent`, `confirmPendingPrint`, `markPrintFailed`.

Estado e evento são gravados em chamadas distintas, e erros de eventos são ignorados. Baixa não preenche autor/hora/motivo de encerramento. Updates condicionais não verificam linhas efetivamente afetadas; duas sessões podem registrar eventos para uma única transição. Contador de reimpressão usa leitura e escrita de valor antigo, podendo perder incremento concorrente.

### FUN-09 — Configurações por empresa existem só no modelo

**Prioridade: média.** Fontes: `label_settings`, `loadSettings`, `loadAlertDays`.

Tamanho, impressora e alerta são locais ao navegador e compartilhados entre empresas/usuários que usam o mesmo perfil do navegador. Não sincronizam entre celular e computador. A fila também não sincroniza: a orientação de preparar no celular e imprimir no computador não fornece transferência de fila no sistema atual.

### FUN-10 — Consulta pública desconsidera print status

**Prioridade: média.** Fonte: RPC `get_label_by_token` e tela pública.

Consulta não retorna `print_status`. Etiqueta preparada/com falha pode aparecer como ativa/no prazo, apesar de não entrar no PVPS. É preciso decidir se o rastreio deve existir antes da confirmação.

## 3. Administração e manutenção

### ADM-01 — Reset master gera link sem enviá-lo

**Prioridade: alta.** Fonte: `resetUserPassword` e botão na área master.

Handler usa `auth.admin.generateLink`, descarta o link e retorna sucesso. A UI anuncia “Link de redefinição enviado”. A API destina-se à geração de links para envio por provedor próprio; o envio não está implementado. [Referência oficial Supabase](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).

Recuperação pelo login usa `resetPasswordForEmail`, um fluxo diferente. Convites não especificam redirect, exigindo configuração correta de Site URL no provedor.

### ADM-02 — Criação de usuário pode ficar parcial

**Prioridade: alta.** Fonte: `createUser` e `inviteOperator`.

Auth é criado primeiro; upsert de perfil, insert de papel e colaborador não formam uma transação. Em `createUser`, erros posteriores não são checados. Usuário pode receber convite/conta e permanecer sem perfil/papel mesmo com retorno de sucesso. Precisa existir estratégia de compensação/retomada.

### ADM-03 — Empresa possui duas fontes de status

**Prioridade: média.** Fonte: `ClientsPanel.handleDelete`, `setClientStatus`, `client_is_operational`.

Inativação rápida altera só `active`; emissão SQL verifica `status`. A tela pode ocultar a empresa e a API ainda tratá-la como operacional. Salvar empresa pela tela principal também transforma active true em status ativa, podendo reativar suspensão inadvertidamente.

### ADM-04 — Papel e navegação não estão consolidados

**Prioridade: média.** Fontes: `ROLE_TABS`, `DashboardPanel`, `getCurrentUserContext`, unique de `user_roles`.

Nutricionista recebe controles de Clientes que não pode gravar; cards abrem abas fora do menu; helper omite gerente; múltiplos papéis válidos no banco podem quebrar `maybeSingle`. A política de leitura de papéis ainda usa admin legado.

### ADM-05 — Auditoria exibida não corresponde aos eventos

**Prioridade: média.** Fontes: `activity.functions.ts`, `AtividadesTab`, `logLabelEvent`.

Atividades master lê `activity_logs`; impressão escreve `label_events`. `logActivity` não é chamado nos fluxos identificados. Não há linha do tempo de etiqueta na UI, apesar de o plano histórico prevê-la. Uma tabela existir não garante cobertura de auditoria.

### TEC-01 — Reconstrução do banco depende de dois históricos

**Prioridade: alta para migração.** Fontes: `supabase/migrations`, `drizzle/migrations`, `drizzle/schema.ts`.

Somente migrar Supabase deixa fora print status/eventos, usados pela consulta principal. Schema Drizzle vazio não documenta as tabelas. Grants, extensões e privilégios devem ser confrontados com o banco real antes de reconstrução.

### TEC-02 — Build/tipagem passam; lint falha

**Prioridade: média.** Ver [verificação](07-verificacao.md). Build e `tsc --noEmit` retornaram 0. ESLint retornou 1 com 1.237 problemas: 1.231 erros e 6 avisos. Destes erros, 1.227 são Prettier, um `prefer-const` e três `no-empty`. Não foram aplicados fixes automáticos.

Uso recorrente de `as never` contorna tipagem das chamadas de banco. Tipagem passar não valida SQL, permissões ou fluxos de negócio. O build emite depreciação de `inputValidator`.

### TEC-03 — Estrutura concentra responsabilidades

**Prioridade: média.** Fonte: `index.tsx` e rotinas locais.

Arquivo principal mistura autenticação, autorização, dados, cadastros, regras de validade, renderização e impressão. Existem helpers duplicados/contexto não utilizado, componentes de biblioteca sem uso e restos de template. Isso aumenta custo de manutenção e dificulta ensaios independentes, sem justificar reescrita completa antes de definir prioridades.

### TEC-04 — Operação ainda não está documentada no repositório original

**Prioridade: média.** Não foram encontrados CI, suite de testes, procedimento de backup/restauração, start de produção próprio ou monitoramento independente. Telemetria de erro usa hook opcional Lovable; fora dele tende a não reportar. Imagem social externa, URLs de QR dependentes da origem e sitemap sem base devem entrar na análise de saída.

## 4. Ordem sugerida para futura discussão

1. Confirmar infraestrutura atual, acesso a dados/Auth e privilégios reais.
2. Revisar isolamento entre empresas e integridade das transições.
3. Definir o comportamento esperado de impressão, retomada, lote NiiMbot e PVPS completo.
4. Consolidar migrações e testar restauração no destino.
5. Separar OAuth/build/hospedagem do Lovable e validar todos os perfis.
6. Depois avaliar organização interna, consistência visual e expansões.

Essa ordem é uma proposta documental. Não foi iniciada execução dessas mudanças.
