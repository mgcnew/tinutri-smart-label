# Validades: apresentação e operação

Atualização em 01/10/2026, aprovada após a reformulação das demais páginas.

A página utiliza o padrão visual do painel: cabeçalho com hierarquia clara, cartões brancos, bordas discretas, verde da marca e cores de urgência acompanhadas de texto. Os filtros ficam reunidos em uma área própria, com pesquisa por cliente, produto e lote, período e antecedência do aviso. As buscas ignoram acentos e diferenças entre maiúsculas e minúsculas.

O panorama mostra quatro grupos exclusivos: vencidas, vencem hoje, próximas de vencer e dentro do prazo. O período escolhido no Dashboard continua aplicado ao abrir Validades. As contagens acompanham os filtros e consideram apenas etiquetas ativas com impressão confirmada, obtidas pela consulta paginada do panorama operacional. Não há dependência do limite do histórico recente. Cada grupo apresenta inicialmente dez registros, com opção de mostrar mais, preservando a contagem completa.

Cada etiqueta mostra produto, empresa, lote, validade com horário, tempo restante, responsável, armazenamento e emissão. O nome do produto e o botão de detalhes abrem o registro específico e sua linha do tempo.

A baixa passa por um modal com resumo da etiqueta e escolha explícita entre utilizada, consumida e descartada. Nenhuma opção vem selecionada. Enquanto a gravação está pendente, a confirmação e o fechamento ficam bloqueados. Falhas preservam a seleção e apresentam feedback; sucesso atualiza a consulta e informa o resultado. O componente permanece montado durante a atualização para preservar o estado do modal e o aviso de sucesso.

A tela apresenta carregamento, estado vazio, ausência de resultados, datas inválidas e falha de consulta. Erros de consulta não são apresentados como contagens zeradas. A antecedência continua limitada a 1–90 dias e armazenada localmente no navegador, como antes.

Implementação: `src/components/ValidadesPanel.tsx`, integração em `src/routes/index.tsx` e estilos em `src/styles.css`. Nenhuma mudança de esquema ou migração de banco.

Validação técnica: TypeScript, ESLint do novo componente e build de produção. O ensaio de interface utiliza Chromium com autenticação, dados e gravações simuladas; não homologa o backend remoto.

O ensaio de navegador passou em larguras de 320, 375, 768 e 1440 px, sem rolagem horizontal. Foram verificados: 606 etiquetas ativas paginadas, período recebido do Dashboard, busca e limpeza de filtros, expansão da lista, abertura do registro correto, ausência de confirmação sem destino, falha de gravação sem evento de baixa, sucesso com atualização para 605 registros e aviso persistente, modal em 320 px e recuperação de falha de consulta sem contagens falsas.
