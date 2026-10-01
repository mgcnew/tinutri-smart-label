# Produtos em modal e categorias no campo

A página Produtos abre com o botão Cadastrar produto, pesquisa, filtro por empresa e lista de produtos ativos. Cadastro e edição usam modal, incluindo a abertura direta a partir de um registro de auditoria. O modal segue o padrão da página Clientes: cabeçalho e ações visíveis, rolagem interna, agrupamento de campos, feedback e retorno de foco.

O campo Categoria é um combobox editável. Sugere nomes encontrados nos produtos da empresa selecionada e oferece Criar categoria quando o texto tem entre 2 e 80 caracteres e não corresponde a uma opção existente. Setas e Enter permitem selecionar ou criar; Escape fecha primeiro as sugestões. Variações de caixa e acentos reutilizam a grafia já existente ao salvar. Trocar a empresa limpa a categoria para evitar carregar sugestões de outro cliente.

Não há tabela de categorias no banco atual. A nova categoria é persistida no campo `products.category` quando o produto é salvo; cancelar ou falhar não cadastra categoria. As sugestões são derivadas do catálogo ativo carregado, sem criar entidades independentes ou executar migrações.

Empresa, produto, categoria, validade em dias e inspeção quando exigida são validados. Durante a gravação os campos ficam desabilitados. Erros preservam os dados; sucesso fecha o modal, atualiza a lista e informa o resultado. A auditoria existente continua ocorrendo após confirmação da gravação.

Arquivos: `src/components/ProductsPanel.tsx`, `src/components/CategoryInput.tsx`, `src/lib/categories.ts`, integração em `src/routes/index.tsx` e estilos em `src/styles.css`.

Validação com dados simulados: telas de 320, 375, 768 e 1440 px; categoria restrita à empresa; criação e seleção pelo campo; inspeção; cancelamento; falha de gravação; estado pendente; reutilização após salvar; edição; abertura do produto pela auditoria. Nenhum cadastro de teste é enviado ao banco remoto.
