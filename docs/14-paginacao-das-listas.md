# Paginação das listas

Atualização em 01/10/2026. Abrange Clientes, Produtos, Histórico e Validades.

As quatro páginas consultam os registros sob demanda, com `range(offset, offset + tamanho - 1)` no Supabase/PostgREST. A página padrão contém 20 registros, com alternativas de 10 e 50. A navegação oferece anterior, próxima, números de página e acesso aos extremos. A contagem exata vem do banco; não é calculada sobre os registros da página.

Os filtros são enviados ao banco antes da paginação. Pesquisas de texto aguardam 300 ms para evitar uma chamada por tecla, ignoram maiúsculas e acentos comuns do português e tratam pontuação como texto literal. A construção dos filtros protege as aspas e os caracteres de expressão regular. Isso permite localizar registros que nunca foram carregados no navegador. Mudanças de filtro ou de tamanho retornam à primeira página. Ordenações têm o id como desempate.

Após uma gravação, a página atual é consultada novamente. Se uma inativação ou baixa remove o último registro da última página, a navegação retorna à última página válida. Consultas antigas são canceladas e seus resultados não substituem a consulta atual. Há estados de carregamento, erro, nova tentativa e ausência de resultados.

## Comportamento por página

- **Clientes:** paginação por nome e id, filtros de texto e situação no banco. Os totais de todos, ativos, inativos e suspensos respeitam a pesquisa e são consultados com HEAD, sem transferir os cadastros completos.
- **Produtos:** paginação por nome e id, pesquisa em nome/categoria e filtro por empresa. O nome da empresa acompanha cada produto por relacionamento. Os modais continuam funcionando, e os dados anteriores usados na auditoria vêm do registro editado, independentemente da página atual.
- **Histórico:** elimina a carga antecipada e o teto de 500 registros. Ordenação por emissão e id, ambas decrescentes. Produto, responsável, cliente e data são filtrados no banco. A data de emissão considera o dia local completo, e os registros antigos continuam acessíveis.
- **Validades:** substitui a expansão progressiva de dez itens por grupo por uma paginação única, com agrupamento dos registros da página por urgência. Os cartões mostram os totais globais do filtro, consultados com HEAD. Clicar em um cartão filtra a lista por urgência. A baixa preserva o modal e o aviso de sucesso durante a atualização. As janelas de hoje, três dias e sete dias e as etiquetas antigas sem horário continuam contempladas.

Os links de ações do Dashboard consultam o cadastro por id, mesmo quando ele está fora da página atual. As consultas de listas e de registros específicos têm escopo adicional por empresa/carteira; RLS permanece responsável por autorizar cada operação.

## Carga inicial e seleções

O login não busca mais o catálogo completo nem o histórico. A raiz mantém apenas os dados compactos de empresas necessários às seleções (`id,name,active,status,public_code`). A página de Clientes busca os dados completos separadamente e por página.

A seleção de produtos na emissão busca 20 opções por vez, com pesquisa no banco e navegação. O produto selecionado é preservado ao pesquisar outra página. A duplicação pode recuperar um produto específico por id. As sugestões de categoria são consultadas somente com o modal aberto, na empresa selecionada, com até 50 registros e refinamento pelo texto digitado; o campo continua permitindo cadastrar uma categoria junto com o produto.

O Dashboard consulta somente campos compactos das prioridades vencidas e dos próximos sete dias. Essa consulta continua completando as páginas desse subconjunto para calcular produtos distintos por período; não transfere todos os registros futuros nem os dados completos das etiquetas. A lista de Validades tem consulta independente e paginada. Não foi introduzida dependência de RPC ou de migração SQL para essa alteração.

## Arquivos

Componentes: `PaginationControls.tsx`, `HistoryPanel.tsx`, `ClientsPanel.tsx`, `ProductsPanel.tsx`, `ValidadesPanel.tsx` e `EmissionProductPicker.tsx`. Hooks: `use-paginated-query.ts`, `use-focused-entity.ts` e ajuste de `use-operational-overview.ts`. Filtros: `src/lib/list-query.ts`. Integração: `src/routes/index.tsx`.

Os ensaios de navegador utilizam autenticação, dados e gravações simuladas. Não há alteração de dados reais, aplicação de migrações ou publicação nesta etapa.

## Validação

TypeScript, ESLint dos componentes e hooks alterados e build de produção aprovados. Oito testes Node passaram (`test:lists` e `test:dashboard`), cobrindo busca literal por acentos/pontuação, limites das janelas e validade antiga sem horário.

O ensaio em Chromium verificou 101 produtos, 55 clientes e 606 etiquetas simuladas: consultas limitadas a cada página na rede, navegação sem repetir registros, busca por itens fora da primeira página, edição mantendo a página, redução da última página após inativação, pesquisa de histórico antigo, contagens globais e baixa em Validades, recuperação de falha de consulta e abertura por id via auditoria. Os quatro layouts foram verificados em 320, 375, 768 e 1440 px. Um operador recebeu apenas os registros de sua empresa. Nenhuma gravação alcançou o backend real.
