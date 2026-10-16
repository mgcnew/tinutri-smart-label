# Permissões por pessoa

O **perfil** (master, nutricionista, administrador da empresa, gerente, colaborador) define o padrão. Quem gerencia acessos pode **liberar ou retirar** permissões de cada pessoa da empresa, sem mudar o perfil.

## Permissões

| Permissão | O que controla | Aplicada em |
|---|---|---|
| `descartar` | Dar baixa como descartada | gatilho no banco + botão na tela |
| `ver_historico` | Tela de Histórico | tela (os dados seguem lidos pelo banco para o controle de validades) |
| `gerir_produtos` | Criar, editar e excluir produtos | regras de linha do banco + tela |
| `gerir_colaboradores` | Cadastrar e desativar responsáveis | regras de linha do banco + tela |
| `gerir_impressoras` | Impressoras de rede e agentes | regras de linha do banco + tela |
| `gerir_acessos` | Convidar, desativar e ajustar pessoas | funções do banco + tela "Equipe e acessos" |

## Padrões por perfil (iguais ao que já valia)

| | Master | Nutri | Admin empresa | Gerente | Colaborador |
|---|---|---|---|---|---|
| descartar, ver_historico | sim | sim | sim | sim | sim |
| gerir_produtos / colaboradores / impressoras | sim | sim | sim | sim | não |
| gerir_acessos | sim | não | sim | sim | não |

## Regras de segurança

- Só se gerencia quem tem **posição menor** (admin da empresa > gerente > colaborador) e é da **mesma empresa**. Ninguém altera a si mesmo.
- Ninguém concede uma permissão que **não possui**.
- Só o administrador da empresa concede `gerir_acessos` e convida gerentes. Gerente convida colaboradores.
- Pessoa **desativada** perde o acesso aos dados da empresa; o histórico dela permanece. Reativar devolve o acesso.
- Toda alteração (convite, permissão, ativação) entra no histórico de atividades.

## Banco

- Migration `20261009160000_granular_permissions.sql`: tabela `user_permissions`, funções `my_permissions`, `company_team`, `set_member_permission`, `set_member_active`, `can_invite_member` e as regras de linha de produtos, colaboradores e impressoras.
- Se a migration ainda não foi aplicada, o app usa os padrões do perfil e esconde a tela de acessos.
- O convite usa a função de servidor `inviteTeamMember` (`src/lib/team.functions.ts`), que confere `can_invite_member` antes de criar o acesso.
