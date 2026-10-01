# Página de Clientes e formulários em modal

O cadastro e a edição da página Clientes da aplicação principal abrem em modal, sem substituir a lista nem limpar sua busca ou filtro. O modal separa identificação, contato e gestão, tem rolagem interna e mantém cabeçalho e ações visíveis. Campos obrigatórios são identificados e possuem rótulos associados.

Os cards mostram nome completo, razão social, status, plano, localização e contatos. Foram removidos os identificadores técnicos da apresentação principal. Editar e Inativar têm texto e ícone; a ação de inativação não é apresentada como exclusão. O QR Code permanece disponível.

A busca aceita nomes e cidades sem acentos e CNPJ com ou sem pontuação. Filtros Todos, Ativos, Inativos e Suspensos mostram suas contagens. Os estados vazios distinguem ausência de cadastro e ausência de resultados.

Ao salvar, o formulário fica desabilitado e informa andamento. Uma falha mantém os dados no modal e permite tentar novamente; sucesso fecha o modal e mostra confirmação na lista. O foco volta ao controle que abriu o modal. Novos registros de auditoria continuam sendo gravados depois da confirmação do banco. A edição preserva a situação suspensa, e o indicador `active` é gravado de acordo com a situação selecionada.

Implementação em `src/components/ClientsPanel.tsx`, integrada à rota principal, com estilos `.clients-*`/`.client-*`. O componente de diálogo ganhou uma opção de estilo de overlay; os outros diálogos mantêm o padrão anterior. Esta alteração não converte os formulários da rota `/admin` para modais.

Validação: ensaios de navegador com APIs simuladas em 320, 375, 768 e 1440 px, incluindo busca, filtros, criação, edição, cancelamento, foco, salvamento com falha, estado pendente e auditoria. Não foram enviados dados de teste ao banco remoto.

Possíveis próximas melhorias visuais: filtros por plano e localização; detalhes de cliente em modal com contatos e resumo da operação; confirmação de inativação em diálogo no mesmo padrão visual.
