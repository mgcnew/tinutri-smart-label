# Documentação do TiNutri Smart Label®

Análise do estado atual em **01/10/2026**, baseada no código disponível neste repositório. Esta etapa documenta o sistema; não executa migração, correções, alterações de dados ou publicação.

**Evoluções posteriores:** os documentos 01–07 retratam o levantamento inicial. A implementação aprovada do novo panorama está em [Dashboard operacional](08-dashboard-operacional.md), com comportamento, fontes de dados e validação.

A adaptação das quatro abas administrativas está em [Área Master responsiva](09-area-master-responsiva.md).

A evolução para gestão e acompanhamento em seis áreas está em [Reformulação da Área Master](15-area-master.md), com [SQL para aplicação manual](sql/15-area-master.sql).

A reformulação da lista e dos formulários de clientes está em [Clientes e modais](10-clientes-e-modais.md).

O catálogo e a criação de categorias pelo campo estão em [Produtos e categorias](11-produtos-e-categorias.md).

A organização da emissão e das configurações está em [Estação de etiquetagem](12-estacao-de-etiquetagem.md).

A apresentação e o fluxo de baixa estão em [Validades](13-validades.md).

A consulta sob demanda das quatro listas está em [Paginação das listas](14-paginacao-das-listas.md).

## Leitura sugerida

| Documento | Conteúdo |
| --- | --- |
| [Arquitetura e estrutura](01-arquitetura.md) | Tecnologias, organização, rotas, execução, integrações e configuração |
| [Funcionalidades e regras](02-funcionalidades.md) | Perfis, cadastros, emissão, impressão, PVPS, histórico e jornadas |
| [Design system](03-design-system.md) | Identidade, tokens, tipografia, componentes, responsividade e acessibilidade |
| [Banco de dados](04-banco-de-dados.md) | Dicionário das dez tabelas, relacionamentos, enums, RLS, funções e migrações |
| [Diagnóstico e pontos de atenção](05-diagnostico.md) | Problemas encontrados, evidências, impactos e prioridades sugeridas |
| [Saída do Lovable e migração](06-migracao-supabase.md) | Dependências, dados a preservar, autenticação, infraestrutura e roteiro para futura decisão |
| [Verificação e limites](07-verificacao.md) | Comandos executados, resultados, cobertura e o que exige validação posterior |

## Visão executiva

O produto é uma aplicação para identificação de alimentos por etiquetas térmicas, com bases separadas por estabelecimento. O fluxo central é selecionar produto e responsável, calcular a validade, preparar e imprimir a etiqueta e acompanhar sua situação.

O código atual já implementa mais do que o briefing inicial do README: cinco perfis atuais, carteira de nutricionistas, administração master, QR Code individual, fila de impressão, confirmação manual da impressão e painel PVPS — primeiro que vence, primeiro que sai.

A base técnica já usa **Supabase/PostgreSQL e Supabase Auth**. Sair do Lovable significa distinguir a gestão do backend, a autenticação Google intermediada pelo Lovable, o build e a hospedagem. O repositório, sozinho, não comprova se a instância atual pertence ao Lovable Cloud ou a uma conta própria do Supabase. Isso precisa ser confirmado no ambiente antes de definir a transferência.

A implementação contém pontos relevantes para a próxima etapa: a política de edição do próprio perfil permite alterar a empresa vinculada; a edição de etiquetas tem permissões amplas; configurações de impressão e alerta são locais ao navegador; o PVPS depende dos últimos 500 registros; a confirmação de impressão pode se perder ao recarregar; o modo NiiMbot exporta somente a última unidade de um lote. Cada achado está detalhado com sua fonte no diagnóstico.

O histórico SQL está dividido entre **dez migrações Supabase e uma migração Drizzle**. Recriar somente a pasta `supabase/migrations` não reproduz todos os recursos usados pelo frontend.

## Como interpretar esta documentação

- **Implementado no código:** encontrado em arquivos e fluxos concretos; não significa que foi homologado em produção.
- **Definido nas migrações:** estrutura reconstruída dos scripts SQL; não confirma que todos foram aplicados no banco remoto.
- **Achado estático:** comportamento ou fragilidade identificada por leitura; não foi explorado contra dados reais.
- **Proposta:** possibilidade para discussão futura; nenhuma alteração funcional foi feita.

Não foram exportados dados de clientes, usuários, senhas ou chaves. Os valores de ambiente não são reproduzidos nos documentos. A análise de interface deriva do JSX e CSS; não substitui uma avaliação visual interativa nem ensaio em impressora física.

## Escopo preservado

O README original e o plano em `.lovable/plan` foram usados como referências históricas. Onde divergem da implementação, esta documentação descreve o código atual e registra a diferença. Nenhuma conformidade sanitária ou jurídica é certificada por esta análise técnica.
