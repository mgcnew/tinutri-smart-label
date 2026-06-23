## TiNutri Smart Label® — Estrutura SaaS Multiempresa

Transformar o app atual (hoje single-tenant na prática, com tudo em `src/routes/index.tsx`) em um SaaS multiempresa com 4 níveis de acesso, isolamento total de dados, logs de auditoria e área master.

---

### 1. Banco de dados (migration única)

**Novos papéis (enum `app_role`):**
- `admin_master` (TiNutri)
- `nutricionista` (equipe TiNutri, carteira de clientes)
- `admin_cliente` (gestor da empresa)
- `operator` (já existe — produção)

Manter `admin` antigo migrando para `admin_master`.

**Novas colunas / tabelas:**

- `clients`: adicionar `status` enum (`ativa`, `inativa`, `suspensa`) — manter `active` por compatibilidade, derivar de `status`.
- `nutritionist_clients` (carteira): `nutritionist_user_id`, `client_id` (unique pair). Grants + RLS.
- `products`: adicionar `created_by`, `updated_by` (uuid → auth.users).
- `issued_labels`: adicionar `issued_by_user_id` (uuid auth.users) — já existe `issued_by` texto.
- `activity_logs`: `id`, `client_id`, `user_id`, `user_name`, `action` (texto: `product.created`, `label.printed`, `login`, etc.), `entity_type`, `entity_id`, `metadata` jsonb, `created_at`.

**Funções security definer:**
- `has_role(user_id, role)` — já existe, estender para novos papéis.
- `is_admin_master(user_id)` — wrapper.
- `current_user_client_id()` — lê de profiles.
- `nutritionist_has_client(user_id, client_id)` — consulta `nutritionist_clients`.
- `user_can_access_client(user_id, client_id)` — combina: admin_master OR profile.client_id = client_id OR nutricionista com carteira.

**RLS revisada em todas as tabelas** usando `user_can_access_client` para SELECT/UPDATE/INSERT/DELETE conforme matriz de permissões. GRANTs para `authenticated` e `service_role`.

**Trigger** em `products` para preencher `updated_by` automaticamente; trigger em `issued_labels` para registrar log + `issued_by_user_id`.

**Bloqueio de empresa suspensa:** função `user_client_status()` que retorna o status — front bloqueia a tela.

### 2. Server functions (`src/lib/`)

- `auth.functions.ts`: `getCurrentUserContext` → retorna `{ role, clientId, clientStatus, clientName, displayName }` (usa `requireSupabaseAuth`).
- `admin.functions.ts` (estender): `listAllClients`, `upsertClient`, `setClientStatus`, `createUser` (admin/nutri/admin_cliente/operator), `resetUserPassword`, `assignNutritionistClient`, `removeNutritionistClient`, `masterStats` (contagens).
- `activity.functions.ts`: `logActivity`, `listActivity({ clientId? })`.
- Reaproveitar `inviteOperator` adaptando para receber `role`.

### 3. Rotas

- `/auth` — login + "Esqueci minha senha" (`supabase.auth.resetPasswordForEmail`) + página `/reset-password`.
- `/_authenticated/` — gate (já gerenciado pela integração). Dentro:
  - `/` — fluxo de emissão (atual `index.tsx` movido para `_authenticated/index.tsx`), filtrando tudo por `clientId` do usuário. Se empresa suspensa, exibir tela de bloqueio.
  - `/admin` — área master (somente admin_master): lista de empresas, criar/editar/suspender, criar usuários, ver estatísticas, vincular nutricionista↔cliente.
  - `/admin/empresas/:id` — detalhe da empresa (produtos, colaboradores, etiquetas, log).
  - `/atividades` — log de atividades (filtrado pelo escopo do usuário).

Nutricionista vê seletor de cliente (carteira); ao escolher, fluxo de emissão opera no contexto daquele cliente.

Admin cliente e operador: `clientId` fixo do profile, sem seletor.

### 4. UI

- Header: nome do usuário, papel, empresa atual.
- Footer global: `TiNutri Smart Label® — Validade simples. Segurança sempre. Desenvolvido por TiNutri Soluções em Consultoria de Alimentos. © 2026 …`.
- Tela "Empresa suspensa": mensagem solicitada, sem permitir uso.
- Menus condicionais por papel (Emitir / Histórico / Produtos / Colaboradores / Atividades / Admin).

### 5. Log de atividades

Disparado em:
- login (root `onAuthStateChange` → server fn).
- create/update/delete product e collaborator.
- print/reprint/duplicate label (já no fluxo de emissão).

Ordenado desc, paginado simples.

### 6. Backup

Comentário no projeto + nota: backup diário roda no Lovable Cloud (Postgres gerenciado). Não expor UI.

### 7. Fora de escopo (não implementar)

Estoque, financeiro, CMV, compras, ERP, dashboards complexos, relatórios avançados, IA.

---

### Ordem de execução

1. Migration (schema + RLS + funções + grants + trigger).
2. Aguardar aprovação e regeneração de tipos.
3. Server functions de auth/admin/activity.
4. Rotas `/auth`, `/reset-password`, `/_authenticated/admin*`, `/_authenticated/atividades`.
5. Refatorar `index.tsx` → `_authenticated/index.tsx` com filtro por `clientId` do contexto e tela de empresa suspensa.
6. Footer global + cabeçalho com papel/empresa.
7. Hook de logging em criação/edição/impressão.
8. Configurar Google auth + reset de senha email template (Lovable Emails).

### Notas técnicas

- Sem alteração no layout/template das etiquetas impressas — apenas filtragem por `client_id`.
- Manter compat: papel `admin` antigo vira `admin_master` via UPDATE no migration.
- `claimFirstAdmin` continua funcionando para o primeiro admin_master.
- Todas as queries do front passam a usar `clientId` do contexto retornado pelo server (sem trust no client).
- Empresas inativas/suspensas: dados permanecem, apenas bloqueio de uso operacional. Admin master continua vendo tudo.

Posso prosseguir?