# Área Master: gestão e acompanhamento

Implementação aprovada em 01/10/2026. Esta evolução substitui a apresentação antiga de quatro abas; o documento 09 permanece como histórico.

## Interface e jornadas

A Área Master usa a identidade da estação: logo existente, verde da marca, superfícies claras, tipografia com hierarquia, sidebar fixa e cabeçalho compacto. No celular, a navegação abre em gaveta. Listas, filtros e modais se adaptam à largura disponível. O rodapé permanece na área de conteúdo.

As seis áreas são:

- **Visão geral:** empresas ativas, empresas sem nutricionista, acompanhamentos abertos e atrasados, prioridades de validade, movimento por período e últimas ações de gestão. Os indicadores abrem seus filtros; ações recentes permitem consultar as alterações e abrir o cadastro.
- **Empresas:** lista paginada, pesquisa, situação e filtro de empresas sem nutricionista. Cadastro e edição em modais. A ficha reúne contatos, responsáveis pela carteira, QR Code, indicadores e atalhos para catálogo, validades, histórico, usuários, acompanhamento e atividades.
- **Usuários:** pesquisa, filtros de perfil e empresa, paginação, convite/senha inicial e edição de acesso em modais. A situação de acesso deriva da autenticação, distinguindo convite pendente de acesso já realizado. Recuperação de acesso pede confirmação e solicita efetivamente o e-mail pelo Supabase Auth.
- **Carteira:** nutricionistas paginadas, total de vínculos e gerenciamento da carteira em modal com empresas paginadas. Remover um vínculo exige confirmação porque revoga acesso à empresa.
- **Acompanhamento:** tarefas, ocorrências e visitas em lista paginada, filtros por empresa/tipo/situação/pesquisa, responsável, prioridade e prazo. Registro e edição em modal. Visitas admitem observações e próxima visita. Ocorrências admitem motivo e produto relacionado.
- **Atividades:** lista paginada com empresa, pessoa, tipo e data; modal de antes/depois e abertura do registro de origem quando disponível.

Nutricionistas encontram **Acompanhamento** na estação principal, limitado à própria carteira. A administração de usuários/permissões permanece exclusiva do Master.

## Ativação manual no Lovable

O arquivo completo é [SQL da Área Master](sql/15-area-master.sql). **Não foi aplicado ao backend remoto.** Copie todo o conteúdo, de `begin` até `commit`, e execute manualmente no editor SQL do ambiente atual. Depois atualize a página.

O script pressupõe as tabelas, colunas e enums atuais do projeto, incluindo `nutritionist_clients`, `activity_logs`, campos de confirmação/baixa das etiquetas e os perfis de acesso. Deve ser executado pelo proprietário administrativo do banco. Não depende de novas variáveis de ambiente.

O script cria:

- `care_records`, índices, regras de integridade e políticas de acesso;
- validação de responsáveis e preenchimento do autor/datas pelo banco;
- auditoria automática das inclusões e alterações de acompanhamento;
- `master_directory`, `master_summary`, `care_people` e `master_update_access`;
- permissões das funções e atualização do cache de esquema do PostgREST.

Não altera cadastros existentes durante a instalação. As funções de edição só alteram dados quando acionadas pela interface. A edição de acesso usa uma transação, impede remover o próprio acesso Master ou o último administrador e reconcilia equipe/carteira conforme o novo perfil.

Até a aplicação do SQL, os recursos dependentes mostram que aguardam ativação. Uma consulta com falha não é apresentada como contagem zero. Cadastros e consultas que usam recursos anteriores permanecem disponíveis onde independentes das novas funções.

## Regras e confiança

Os indicadores são contagens completas no banco. As janelas de validade usam o instante de vencimento, com fallback para o final da data local em registros antigos. Vencidas, hoje, próximos três dias e quatro a sete dias não se sobrepõem. Só etiquetas ativas com impressão confirmada entram nessas prioridades.

Pendências não são concluídas pelo vencimento do prazo. Concluir um acompanhamento exige registrar resultado/orientação. Empresa e tipo são imutáveis após a criação. Uma alteração concorrente é detectada pelo `updated_at` e mantém o modal aberto com instrução para atualizar.

O responsável deve possuir acesso à empresa. Nutricionistas podem consultar/criar/editar acompanhamentos apenas de empresas ativas vinculadas à carteira. Operadores, gerentes e administradores de empresa podem ser indicados como responsáveis, mas esta versão não lhes concede a tela de acompanhamento. Não há exclusão de acompanhamentos pela interface ou pelo papel autenticado.

Registrar uma ocorrência de descarte documenta o contexto; a baixa efetiva da etiqueta continua na página de Validades. O histórico de acompanhamento é escrito pelo banco na mesma transação da alteração.

## Relatórios

Exportação CSV por empresa e período, disponível no Master e no acompanhamento da nutricionista. Consulta todos os resultados em lotes de 200 e limita a exportação a 5.000 registros; acima disso solicita reduzir o período/selecionar empresa. Erros e respostas incompletas impedem gerar um arquivo parcial. É possível cancelar.

O relatório de etiquetas filtra por emissão e inclui o estado atual de impressão/baixa. O de acompanhamento filtra pela criação e inclui situação, responsável, prazos, próxima visita e resultado. As células são escapadas para preservar separadores/aspas e impedir fórmulas provenientes de textos cadastrados.

## Verificação

TypeScript, build de produção, lint dos componentes novos/alterados e testes de listas, dashboard e parâmetros dos atalhos. SQL executado duas vezes em PostgreSQL local isolado (PGlite), com usuários e empresas fictícios: RLS por carteira, restrição Master, responsável inválido, autoria não falsificável, conclusão com resultado, auditoria e contagens de mais de mil etiquetas. Nenhuma alteração SQL, convite ou e-mail foi executado em serviços reais durante os testes.

No navegador, com serviços simulados: seis áreas em 320, 375, 768 e 1440 px; modais de empresa, usuário e relatório; paginação e pesquisa remota; criação e conflito de acompanhamento; edição de acesso; recuperação com falha sem falso sucesso; acesso da nutricionista restrito à carteira; CSV com todos os 41 registros permitidos e proteção contra fórmulas; rejeição de atalho para empresa não autorizada.

A ativação e a entrega de e-mails no ambiente Lovable devem ser verificadas após a aplicação manual. O envio depende da configuração de e-mail e URLs permitidas do Supabase Auth existente.
