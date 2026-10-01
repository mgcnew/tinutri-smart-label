# Verificação realizada e limites

Data de referência: **01/10/2026**, contexto do usuário America/Sao_Paulo.

## 1. Método

Leitura das fontes de aplicação, configuração, dependências, componentes base, migrações Supabase/Drizzle, tipos gerados, README e plano histórico Lovable. Cruzamento entre o que as telas oferecem, o que os handlers fazem e o que as políticas SQL autorizam.

Os 46 módulos UI foram inventariados; a avaliação detalhada de design concentra os componentes e padrões usados pelo produto, CSS global e layout de impressão. Não houve auditoria individual de todas as dependências em `node_modules`.

Revisão de variáveis foi limitada aos nomes e à presença das configurações. Nenhum valor de chave, token ou credencial foi colocado nestes documentos. Não houve conexão administrativa ao banco, exportação de clientes, disparo de e-mail, criação de usuário, publicação ou alteração de configuração externa.

## 2. Verificações locais

Ambiente observado: Node `v24.21.0`, npm `11.19.0`. Foram usadas as dependências já instaladas. O package-lock já possuía alterações antes do início; não houve instalação ou alteração intencional do lock nesta análise.

| Comando | Resultado | Interpretação |
| --- | --- | --- |
| `npm run build` | Exit 0 | Compilação de produção concluída para cliente e servidor; saída Nitro/Cloudflare gerada |
| `./node_modules/.bin/tsc --noEmit` | Exit 0, sem diagnóstico | Tipagem passa na configuração atual |
| `npm run lint` | Exit 1 | 1.237 problemas, sendo 1.231 erros e 6 avisos |
| Inventário de SQL e tipos | Dez tabelas, dez migrações Supabase e uma Drizzle | Estrutura descrita localmente; aplicação remota não comprovada |
| Busca de testes/CI/deploy | Sem suite/pipeline própria identificada | Não há testes automatizados de negócio disponíveis para executar |

Lint: 1.227 erros `prettier/prettier`, um `prefer-const`, três `no-empty` e seis avisos `react-refresh/only-export-components`. Não foi executado `--fix` nem formatter.

Build emite depreciação de `createServerFn().inputValidator()` em favor de `validator()`. Ver detalhes de outros avisos no log local; depreciação não impediu compilação. Build não valida dados remotos, chaves runtime, SMTP, RLS ou existência física da impressora.

Logs brutos desta execução ficam em `/tmp/tinutri-audit/build.log`, `/tmp/tinutri-audit/types.log` e `/tmp/tinutri-audit/lint.log`; são temporários, não fazem parte do artefato versionado. O resumo acima é a evidência persistida.

## 3. O que não foi homologado

- Schema real, permissões efetivas, default privileges, migrações aplicadas e volumes em produção.
- Propriedade do backend, configurações do Lovable Cloud e acesso ao Supabase próprio.
- Contas reais, login Google, convites, envio de recuperação e mudanças de sessão.
- Fluxos autenticados no navegador; não foram fornecidas credenciais de teste e não houve navegação interativa automatizada.
- Contraste medido, leitor de tela, teclado completo, dispositivos físicos e screenshots.
- Qualidade térmica, alinhamento, driver Elgin/NiiMbot, leitura de QR em papel e interfaces Bluetooth/USB.
- Carga, limites de consultas, concorrência, disponibilidade, segurança em runtime ou restauração real.
- Conformidade legal/sanitária das regras e prazos de cada produto.

Esses limites não impedem documentar a implementação, mas impedem chamar o sistema de homologado ou garantir que a produção corresponda exatamente ao Git.

## 4. Cenários para uma homologação posterior

| Grupo | Cenários necessários |
| --- | --- |
| Perfis | Master, nutri com/sem carteira, admin cliente, gerente, operador, conta sem papel, múltiplos papéis |
| Isolamento | Leitura e escrita entre A/B, troca de client_id do próprio perfil, vínculo/evento dissociado, empresa suspensa |
| Cadastros | Nome duplicado, CNPJ incompleto, inspeção sem número, falha de rede/RLS, inativação e status consistente |
| Emissão | Prazo zero, prazo manual, datas vazias, lote obrigatório, inspeção, responsável, nomes longos, 200 cópias e fila multiempresa |
| Impressão | Sucesso físico, cancelamento do diálogo, falha posterior à inserção, retry, NiiMbot multiunidade, duplo clique |
| Confirmação | Reload com pendência, segunda emissão pendente, erro ao confirmar, concorrência e retorno ao histórico |
| PVPS | Vencimento hoje por hora, 12 horas, antecedência configurada, registro ativo antigo além de 500, fuso distinto |
| Histórico | Reimpressão concorrente, duplicação completa, data UTC/local, eventos visíveis e baixa com autor/hora |
| Migração | Banco vazio, extensões, grants de UPDATE, importação Auth, manutenção de UUID/token, QR do domínio anterior |
| Interface | 320/375/768/1280 px, zoom 200%, tabela master, preview, foco, teclado e estados de erro |

São cenários de validação futura, não testes executados nesta etapa.

## 5. Referências externas consultadas

Consultadas somente para esclarecer a distinção de backend/hospedagem e a semântica do reset; não substituem o código como fonte desta análise.

- [Supabase: identificar Lovable Cloud ou Supabase próprio](https://supabase.com/docs/guides/troubleshooting/identify-lovable-cloud-or-supabase-backend).
- [Lovable: implantação, hospedagem e propriedade](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership).
- [Supabase: Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).
- [Supabase: migração entre projetos](https://supabase.com/docs/guides/platform/migrating-within-supabase).

## 6. Artefatos e preservação do projeto

Foram adicionados documentos em `docs/`. Build gera arquivos de saída em diretórios ignorados pelo Git. Não foram alterados fontes de aplicação, migrações, configuração de ambiente ou comportamento operacional. Nenhum commit, PR ou deploy foi criado.
