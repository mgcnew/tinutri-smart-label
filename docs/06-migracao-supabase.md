# Saída do Lovable e migração para Supabase próprio

## 1. Situação atual e limite da evidência

O código já usa Supabase Auth, cliente Supabase e SQL PostgreSQL com RLS. **Usar essa API não prova que o backend esteja em uma conta Supabase própria.** A documentação oficial distingue Lovable Cloud, gerido pelo Lovable, de um projeto Supabase conectado e gerido pelo proprietário. Essa distinção precisa ser verificada nas configurações do ambiente. [Fonte: identificar o backend](https://supabase.com/docs/guides/troubleshooting/identify-lovable-cloud-or-supabase-backend).

Esta análise não verificou o painel Lovable/Supabase, não criou projeto de destino e não exportou dados. Portanto, não define que basta trocar URL/chave, nem promete preservação de senhas.

## 2. Camadas que precisam ser separadas

| Camada | Estado atual | Trabalho futuro a considerar |
| --- | --- | --- |
| Código | Repositório local React/TanStack | Preservar fontes e definir fluxo próprio de entrega |
| Dados | PostgreSQL com acesso Supabase | Identificar propriedade atual, exportar/importar schema e dados |
| Auth | Supabase Auth | Migrar usuários/identidades ou definir reset e remapeamento |
| Google OAuth | Adaptador Lovable | Configurar provedor próprio e substituir chamada por OAuth Supabase |
| Build | Configuração agregada Lovable | Reproduzir plugins/preset/SSR/variáveis sem pacote Lovable |
| Servidor | TanStack Start + Nitro | Escolher runtime/hospedagem compatíveis com funções de servidor |
| Domínio e QR | URLs derivadas de `window.location.origin` | Preservar acesso aos QRs já impressos e definir domínio estável |
| Telemetria | Hook opcional Lovable | Definir logs e monitoramento independente |
| Migrations | Supabase + Drizzle | Consolidar processo reproduzível, mantendo mudanças de ambos |

Trocar só o banco não remove OAuth, build e hospedagem Lovable. Transferir apenas código também não transfere Auth, dados ou configurações externas. A aplicação TanStack exige hospedagem do servidor, conforme também distingue a documentação do Lovable. [Fonte: opções de hospedagem e propriedade](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership).

## 3. Inventário das dependências Lovable

| Fonte | Dependência |
| --- | --- |
| `package.json` | `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config` |
| `vite.config.ts` | `defineConfig` do Lovable agrega plugins, ambiente, Nitro, alias e instrumentação |
| `src/integrations/lovable/index.ts` | OAuth intermediado |
| `src/routes/index.tsx` | Botão Google chama adaptador Lovable |
| `previewAuthStorage.ts` | Sessão sincronizada com preview/editor |
| `lovable-error-reporting.ts`, `__root.tsx` | Telemetria via `window.__lovableEvents` |
| `drizzle.config.ts` | URL de migração `LOVABLE_DB_MIGRATION_URL` |
| `bunfig.toml` | Exceções de pacote Lovable |
| README e `.lovable/plan` | Links e histórico da plataforma |
| Metadados raiz | Imagem social em armazenamento `gpt-engineer-file-uploads` |

Mensagens “Connect Supabase in Lovable Cloud” nos clientes/middleware precisam ser adaptadas quando a operação for independente. O logo local pode ser preservado.

## 4. O que precisa ser preservado

- Dez tabelas de negócio e todas as suas linhas.
- UUIDs de empresas, produtos, responsáveis e etiquetas, FKs e snapshots.
- `public_code` de empresa e `public_token` de etiqueta: regenerá-los quebra QRs existentes.
- Autores, carteira, papéis e vínculos de usuário.
- Datas DATE/TIMESTAMPTZ, fuso semântico, status e eventos.
- Índices, checks, enums, schema private, RLS, grants e triggers.
- Usuários Auth, identidades de provedor, configuração de e-mail/OAuth e redirects.
- Configurações de servidor e segredos, com substituição das chaves do projeto no destino.

Não há uso de Storage/Realtime/Edge Functions identificado nas fontes. Isso precisa ser confirmado no ambiente remoto: configuração externa não é totalmente visível no Git.

Preferências em localStorage não são exportadas com o banco e não migram automaticamente para outro domínio/navegador. Fila e pendências em memória também não fazem parte de um backup.

## 5. Autenticação: decisões dependem do acesso disponível

Se for possível transportar Auth com UUIDs/identidades de forma compatível e autorizada, preservar IDs reduz trabalho nos vínculos. Se usuários forem recriados com novos UUIDs, remapear `profiles.user_id`, `user_roles.user_id`, `collaborators.user_id`, `nutritionist_clients.nutritionist_user_id`, autores de products/issued_labels, encerramentos, confirmações, activity_logs e label_events. Campos sem FK também exigem remapeamento.

Exportar tabelas de aplicação não equivale a exportar credenciais. A possibilidade de preservar senha precisa ser confirmada conforme o mecanismo real de exportação. Uma alternativa é recuperação/reconvite, com comunicação operacional definida na etapa de execução.

Configurar Site URL, URLs autorizadas de retorno, Google client ID/secret, callback, SMTP e templates no destino. Trocar projeto/chaves pode exigir novo login; sessões existentes não devem ser presumidas válidas. Não deixar criação de conta/primeiro master aberta sem o bootstrap definido.

## 6. Roteiro proposto, ainda não executado

1. **Inventário do ambiente:** confirmar tipo/propriedade do backend, volumes, objetos adicionais, extensões, grants, Auth, backup/export disponível e domínio publicado.
2. **Captura de referência:** registrar schema efetivo e contagens, preservar IDs/tokens, identificar dados sensíveis e armazenar backup com acesso restrito.
3. **Destino de homologação:** preparar Supabase próprio e host de servidor; não apontar produção ainda.
4. **Reprodução do schema:** aplicar as dez migrações Supabase e a evolução Drizzle, revisando extensão de aleatoriedade, grants e enum/transações. Não executar importação cega em projeto já populado.
5. **Dados/Auth:** escolher método de migração; preservar IDs ou aplicar mapa explícito; conferir relacionamentos e snapshots.
6. **Independência de código:** substituir build/OAuth/preview/telemetria Lovable com configurações concretas equivalentes; manter servidor e segredo service role fora do cliente.
7. **Homologação:** validar todas as jornadas/perfis, acesso cruzado negado, impressão/PVPS, confirmação pendente, QRs antigos e recuperação por e-mail.
8. **Preparação de corte:** definir janela, tratamento das escritas durante transferência, importação incremental se necessária, domínio e possibilidade real de retorno.
9. **Corte controlado:** executar somente numa etapa posterior autorizada, com backup verificado e critérios de aceite.
10. **Observação e encerramento:** conferir erros/contagens/acessos; desativar recursos anteriores após validação e prazo definido, considerando QRs impressos.

## 7. QR Code e domínio: requisito de continuidade

QR armazena uma URL completa da origem onde foi gerado. Preservar token no novo banco **não** basta se o papel aponta ao domínio antigo. É necessário manter essa origem funcionando/encaminhando para o novo sistema ou definir como os papéis existentes serão substituídos. O controle do domínio `lovable.app` não deve ser presumido equivalente ao de um domínio próprio.

Definir domínio final estável antes de novas emissões em produção evita acumular QRs de origens temporárias. Também revisar imagem social, sitemap e redirects Auth.

## 8. Critérios de aceite para a migração futura

| Área | Evidência necessária |
| --- | --- |
| Dados | Contagens por tabela/empresa e amostras reconciliadas; IDs/tokens preservados |
| Auth | Login de cada perfil, Google, convite e reset; vínculos e carteira corretos |
| Segurança | Conta A não lê/escreve B; usuário não pode mudar próprio escopo; segredo ausente do bundle |
| Banco | Constraints, índices, extensões, grants, triggers e RLS conferidos no destino |
| Operação | Emissão, lote, cópias, falha, confirmação, retomada, baixa, reimpressão e histórico |
| PVPS | Etiquetas ativas completas, inclusive fora do recorte de 500; critério temporal definido |
| Impressão | Teste real de 60 × 40 e 50 × 30; QR legível; NiiMbot com todas as unidades |
| Infraestrutura | Build/SSR/functions funcionando no host final, logs e backup/restauração |
| Continuidade | QRs antigos consultáveis e redirects de e-mail válidos |

## 9. Informações a decidir depois da documentação

Propriedade/acesso do backend atual, projeto/região de destino, hospedagem do servidor, domínio final, volume e janela de migração, política de senhas/convites, modelos reais de impressora, regras de sobrescrita de validade, conteúdo público do rastreio e centralização das configurações por empresa/dispositivo.

Não foram estimados custo ou prazo fechado porque esses pontos alteram materialmente o trabalho. A referência oficial sobre migrações entre projetos fornece caminhos diferentes conforme o acesso a backups e ao banco. [Fonte: migração dentro do Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase).
