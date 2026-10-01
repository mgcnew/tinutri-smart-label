# Dashboard operacional — implementação de 01/10/2026

Esta evolução substitui o resumo de cadastros pelo panorama operacional aprovado após a análise inicial. Os documentos 01–07 preservam o diagnóstico anterior a estas alterações.

## Comportamento

- Saudação, contexto da empresa, botão de emissão e horário da última consulta concluída.
- Se houver várias empresas acessíveis, seleção de empresa ou visão conjunta. O escopo vale também para a lista aberta pelo card.
- Cards clicáveis: **vencem hoje**, **amanhã até o terceiro dia**, **quarto ao sétimo dia**. Os períodos não se sobrepõem.
- Cada card conta produtos distintos por empresa e informa o número de etiquetas físicas. Várias cópias do mesmo produto não aumentam artificialmente a contagem de produtos.
- Alerta separado para etiquetas vencidas, inclusive as que venceram em um horário anterior do dia atual.
- Prioridades ordenadas por validade, com até seis itens na visão inicial, lote, conservação, empresa, responsável e tempo restante.
- Clique no card abre PVPS no período exato; clique em uma etiqueta abre o registro específico, mesmo fora do histórico recente.
- Últimas ações mostram autor registrado, operação, produto/cadastro, empresa e data/hora. Não há criação de eventos históricos fictícios.
- Detalhes de etiqueta incluem situação, impressão, lote, responsável e últimos 50 eventos, com reimpressão, consulta QR e baixa de etiquetas ativas confirmadas.
- Ações de cadastro abrem o registro da alteração, com valores anteriores/posteriores quando disponíveis e acesso direto ao cadastro ativo, conforme o perfil.
- Operador recebe a visão operacional da própria empresa; seus atalhos administrativos permanecem ocultos.

## Revisão visual do painel

O painel segue as premissas da autenticação: fundo neutro, superfícies brancas, verde da logo nas ações e foco, laranja em detalhes da marca e vencimentos de hoje. As cores da marca são compartilhadas por variáveis CSS. A navegação destaca a página atual com `aria-current`, e a identificação da conta usa nome, inicial e perfil sem competir com o conteúdo.

A hierarquia separa título e ação principal, contexto da empresa, controle de validades, prioridades e atividades. Cards têm estados de hover, clique, foco e desabilitado; carregamentos usam placeholders com anúncio acessível. Indicadores distinguem vencidos, vencimentos de hoje e futuros com texto e cor. Erros têm mensagem e tentativa de atualização, inclusive no feed. Movimentos respeitam a preferência por movimento reduzido; no celular, a emissão ocupa toda a largura e os indicadores ficam mais compactos.

A barra lateral é contínua, junto à borda esquerda, com navegação flexível e Área Master (somente para o perfil autorizado) e Sair no rodapé. Seu conteúdo fica fixo entre o topo e a base da tela, independentemente da rolagem e do rodapé da página. No desktop, o rodapé se alinha à área principal, após os 240 px da barra lateral. O topo tem 64 px, com identificação do usuário à direita. No celular, as mesmas ações ficam no rodapé do menu lateral; a saída informa andamento e eventual erro.

## Dados e atualização

Dashboard e PVPS compartilham uma consulta independente de etiquetas com `print_status = confirmada` e `label_status = ativa`. A leitura é paginada e usa o total informado pelo banco para continuar mesmo quando o limite de resposta é inferior ao tamanho de página pedido. Não depende dos últimos 500 registros do histórico.

O feed combina os últimos eventos de `label_events` e atividades de `activity_logs`, ordenados pelo instante registrado. Novas gravações dos cadastros de produtos, colaboradores e clientes na aplicação principal registram criação, edição e inativação **após confirmação da gravação**. Eventos existentes na base também são exibidos. Operações históricas sem auditoria não são reconstruídas; a instrumentação de cadastro desta alteração se concentra na aplicação principal, não adiciona cobertura a todos os handlers de `/admin`.

Nas baixas, a atualização verifica que a etiqueta continua ativa e confirmada, registra `closed_at`/`closed_by` e só cria o evento quando uma linha foi efetivamente alterada. Falhas de gravação e de auditoria são comunicadas. Estado e auditoria ainda são operações distintas, sem uma transação SQL conjunta.

O relógio dos indicadores é recalculado a cada 30 segundos. Dados de outras sessões são obtidos ao atualizar o panorama ou voltar à visão; não foi adicionada assinatura Realtime. Operações locais que recarregam os dados invalidam a visão operacional.

Períodos usam dias do calendário no fuso do navegador, mantendo a convenção atual da aplicação. Registro legado sem `expires_at` usa o fim de `expires_on`. Datas inválidas são sinalizadas e não silenciosamente tratadas como produtos dentro do prazo.

Consultas operacionais têm cancelamento e limite de 20 segundos; detalhes, 15 segundos. Erros aparecem separadamente de estados vazios para evitar que uma falha de consulta pareça ausência de vencimentos. O carregamento desta visão não foi acrescentado ao bloqueio inicial de autenticação.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/OperationalDashboard.tsx` | Panorama, cards, prioridades, feed e atalhos |
| `src/components/LabelDetails.tsx` | Registro e linha do tempo de uma etiqueta |
| `src/components/AuditActionDetails.tsx` | Registro de alteração de cadastro |
| `src/hooks/use-operational-overview.ts` | Consulta paginada, feed, erros e atualização |
| `src/hooks/use-focused-record.ts` | Abertura direta do cadastro sem sobrescrever edição em andamento |
| `src/lib/dashboard.ts` | Períodos, contagem de produtos e nomes de eventos |
| `src/routes/index.tsx` | Integração, navegação, auditoria dos cadastros e PVPS |
| `tests/dashboard.test.ts` | Regressões de datas, limites dos períodos e contagem por empresa |

Nenhuma migração foi executada. São utilizadas as estruturas já existentes em `supabase/migrations` e `drizzle/migrations`. O banco do ambiente precisa ter `label_events`, os campos de confirmação e os privilégios de atualização descritos no levantamento inicial.

## Validação

`npm run test:dashboard` executa cinco testes de regras com Node compatível com remoção nativa de tipos TypeScript (validado em Node 24). Foram verificados vencimento pelo horário, limites de hoje/3/7 dias, fallback legado, produto distinto por empresa e tempo restante.

Ensaios de navegador com APIs simuladas verificaram paginação de mais de 600 etiquetas sob limite de 80 linhas por resposta, etiqueta antiga fora do histórico recente, abertura do evento e cadastro correto, gravação de auditoria após sucesso e ausência de evento quando a gravação falha, filtros de período/empresa, escopo e atalhos do operador, erro com tentativa posterior e ausência de rolagem horizontal em 320/375/768 px. Os dados de ensaio não foram enviados ao banco remoto.

Não houve homologação com contas reais nem validação dos grants/RLS do ambiente remoto nesta evolução.
