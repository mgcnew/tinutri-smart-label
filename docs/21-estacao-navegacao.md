# Estação principal: navegação e redundâncias

Revisão em 16/10/2026 da estação operacional, incluindo a tela de Dashboard. A identidade visual existente foi preservada; as mudanças concentram navegação, avisos e responsabilidades das áreas.

## Consolidações

**Etiquetas** reúne Emissão, Validades (PVPS) e Histórico sob uma entrada do menu e uma navegação interna. Cada etapa conserva suas consultas, filtros e regras. O cabeçalho é compartilhado, com descrição específica por etapa. O contador de urgências continua visível na entrada Etiquetas, inclusive quando a pessoa está em Emissão ou Histórico.

As permissões continuam definindo quais etapas estão disponíveis. Histórico não é exibido quando `ver_historico` está desativado. Reimprimir e duplicar continuam remetendo à emissão; a fila e os campos da emissão permanecem no estado da estação, como antes. A seção abre em Validades para priorizar o controle operacional; o botão principal de emissão no Dashboard abre diretamente a etapa Emitir.

**Empresas do Master** têm um único cadastro na Área Master. A entrada Clientes da estação deixa de aparecer para esse perfil. Links antigos com `painel=clients` redirecionam o Master a `/admin?secao=empresas`; quando um registro é informado, abrem a edição dessa empresa. A abertura de empresas pelas atividades usa o mesmo destino. O acesso continua sujeito à validação do perfil Master na rota administrativa. Nutricionistas conservam Clientes, limitado à própria carteira.

O menu principal do Master passa de nove a seis entradas: Dashboard, Produtos, Colaboradores, Etiquetas, Acompanhamento e Configurações. Área Master e Sair permanecem nas ações inferiores.

## Avisos e ações

- Dashboard usa o aviso de vencidas do próprio panorama, conforme a empresa selecionada. O banner global não é repetido acima dele.
- Validades usa sua lista e seus controles de urgência, sem o banner repetindo os mesmos registros.
- Nas demais telas, o banner global continua disponível para chamar atenção a validades durante outras tarefas. Notificações e som não foram desligados.
- A seção Acesso rápido do rodapé foi removida porque repetia Produtos, Colaboradores e Histórico do menu.
- Últimas ações oferece um acesso contextual ao histórico de etiquetas, condicionado à permissão efetiva.
- O botão Emitir etiquetas do Dashboard foi mantido como atalho da tarefa frequente; ele abre a mesma emissão existente dentro de Etiquetas.

## Áreas mantidas separadas

Produtos é o catálogo usado em várias emissões. Colaboradores registra os responsáveis exibidos nas etiquetas, enquanto Usuários/Equipe e acessos gerencia autenticação e permissões. Acompanhamento trata tarefas, ocorrências e visitas. Essas áreas não foram mescladas porque não representam a mesma entidade ou tarefa.

As ações de reimprimir e duplicar também não são redundantes: reimprimir preserva a etiqueta original; duplicar prepara uma nova emissão. A gestão administrativa permanece na Área Master.

## Compatibilidade e validação

Não exige SQL novo. Os parâmetros de entrada `emit`, `validades` e `history` continuam válidos. Seção e identificador de empresa em links Master são validados por lista permitida e UUID. Os testes de busca de rotas, dashboard e listas cobrem os destinos e a preservação das janelas de validade.

TypeScript, lint dos componentes alterados e build de produção. Navegador com APIs simuladas para conferir aviso único, etapas internas, título único, permissão de histórico, links legados e interface em 320, 375, 768 e 1440 px. Nenhum cadastro, impressão, baixa ou alteração de permissão foi realizado no banco remoto nessa verificação.
