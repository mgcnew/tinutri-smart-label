# Design system

## 1. Identidade visual

A interface usa verde escuro como cor principal, fundo quase branco com nuance verde, cartões brancos e amarelo/dourado nas ações de cozinha. O tom visual é simples, com cantos arredondados, bordas discretas, títulos fortes, espaços amplos e mensagens curtas.

Marca: **TiNutri Smart Label®**. Assinatura: “Validade simples. Segurança sempre.” Logo local em `src/assets/tinutri-logo.png`, normalmente em 40–56 px, com `object-contain`. Login desktop possui painel verde institucional; no mobile o conteúdo de acesso ocupa uma única coluna.

O design system é definido principalmente em `src/styles.css`, `src/components/ui/button.tsx` e `components.json`. A configuração shadcn é `new-york`, base `slate`, CSS variables, ícones Lucide e sem RTL. Os tokens efetivos de marca foram customizados e não correspondem apenas ao tema slate.

## 2. Tipografia

| Uso | Família | Pesos carregados/uso |
| --- | --- | --- |
| Corpo e controles | Manrope | Google Fonts 400, 500, 600, 700, 800 |
| Títulos e marca | DM Sans | Google Fonts 600, 700 |
| Etiqueta térmica | Arial, Helvetica, sans-serif | Valores em pt no HTML e px no canvas |

Fontes são externas e têm fallback para `system-ui`. Títulos principais usam aproximadamente 30 px, 36 px em telas maiores, e login institucional 48 px. Subtítulos/etiquetas de seção usam 12 px, caixa alta, peso forte e tracking. Há metadados em 10–11 px, potencialmente pequenos em operação móvel.

O banco guarda o nome original; a etiqueta e várias situações convertem texto para caixa alta. Não há token próprio de escala tipográfica, line-height ou espaçamento de componentes: esses valores ficam em classes de cada tela.

## 3. Tokens claros

Os valores são OKLCH, registrados no `@theme inline` e acessados por classes Tailwind.

| Token CSS | Valor | Função |
| --- | --- | --- |
| `--background` | `oklch(0.985 0.008 150)` | Fundo geral |
| `--foreground` | `oklch(0.22 0.04 155)` | Texto principal verde escuro |
| `--card`, `--popover` | `oklch(1 0 0)` | Superfícies |
| `--card-foreground`, `--popover-foreground` | `oklch(0.22 0.04 155)` | Texto nas superfícies |
| `--primary` | `oklch(0.34 0.07 155)` | Marca, ações padrão |
| `--primary-foreground` | `oklch(0.99 0.005 150)` | Texto sobre verde |
| `--secondary` | `oklch(0.94 0.02 150)` | Áreas de destaque suave |
| `--secondary-foreground` | `oklch(0.3 0.06 155)` | Texto secundário |
| `--muted` | `oklch(0.95 0.012 150)` | Fundos neutros |
| `--muted-foreground` | `oklch(0.46 0.03 155)` | Texto auxiliar |
| `--accent` | `oklch(0.78 0.13 85)` | Ações kitchen, proximidade de vencimento no QR |
| `--accent-foreground` | `oklch(0.24 0.05 70)` | Texto sobre dourado |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Erros, vencidos e exclusões |
| `--destructive-foreground` | `oklch(0.984 0.003 247.858)` | Texto destrutivo |
| `--border`, `--input` | `oklch(0.9 0.02 150)` | Bordas |
| `--ring` | `oklch(0.5 0.08 155)` | Foco |
| `--label-paper` | `oklch(1 0 0)` | Papel do CSS térmico legado |
| `--label-ink` | `oklch(0.12 0 0)` | Tinta do CSS térmico legado |

Raio base `--radius = 0.875rem` (14 px com base de 16 px). Tokens derivados variam de base −4 px até +16 px. Telas usam também `rounded-2xl`, `rounded-3xl` e bordas pontilhadas no preview.

Tokens de gráficos e sidebar existem, mas as telas principais não usam o componente Sidebar nem gráficos de negócio. O menu é um `<aside>` próprio. Há tema `.dark` com paleta neutra azulada, mas não foi identificado seletor ou persistência de tema. Sua existência não demonstra dark mode completo na interface.

## 4. Componentes e padrões

Há 46 módulos em `src/components/ui`: botões, cards, inputs, selects, dialogs, alerts, accordion, avatar, badge, breadcrumb, calendar, carousel, checkbox, command, context menu, drawer, dropdown, form, hover card, input OTP, label, menubar, navigation menu, pagination, popover, progress, radio group, resizable, scroll area, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle group, tooltip, chart e aspect ratio.

O fluxo principal usa sobretudo **Button e Sheet**, além de inputs/selects/textarea HTML com estilo global. Muitas primitives estão disponíveis, mas não compõem a UI de negócio atual. `Field`, `PanelHeader`, `Brand`, `UserStrip` e os painéis estão dentro do arquivo de rota; a área master implementa outro `Field`.

| Variante Button | Intenção |
| --- | --- |
| `default` | Ação padrão verde |
| `hero` | Verde com sombra maior |
| `kitchen` | Ação operacional dourada |
| `destructive` | Ação de risco/vermelha |
| `outline` | Contorno e fundo claro |
| `secondary` | Destaque suave |
| `ghost` | Ação discreta sem contorno |
| `link` | Link sublinhado no hover |

Tamanhos: default 36 px de altura, sm 32 px, lg 40 px, icon 36 × 36 px, xl 56 px. XL favorece emissão em tela de toque; alguns controles secundários são menores. Botões têm foco visível, estado disabled e ícones de 16 px por padrão.

Inputs globais têm borda, raio grande, padding `0.75rem 0.875rem` e ring de foco de 3 px. Campos master aplicam estilos próprios, rótulos em caixa alta e padding menor. Essa duplicação gera duas densidades visuais.

## 5. Layout e responsividade

- `body` admite mínimo de 320 px.
- Conteúdo principal com `max-w-7xl`, padding 16 px no mobile e 28 px a partir de `sm`.
- Header sticky, fundo translúcido, blur e z-index 30.
- Navegação lateral de 224 px visível em `lg`; abaixo disso menu Sheet à esquerda, largura 86%, máximo equivalente a `max-w-xs`.
- Formulários passam de uma a duas colunas em `sm`; formulário de equipe usa três.
- Emissão separa formulário e preview de 360 px em `xl`.
- Dashboard usa duas colunas no mobile e quatro em `lg`.
- Histórico/PVPS mudam de blocos empilhados para linhas em `md`.
- Master tem container `max-w-6xl`, tabelas de múltiplas colunas sem um wrapper explícito de rolagem horizontal.

Possíveis pontos para avaliação visual: tabelas master em 320/375 px, três botões de baixa lado a lado, cabeçalho com marca e Área Master, textos grandes de empresa e overflow da etiqueta/preview. Não houve ensaio visual interativo nesta etapa.

## 6. Estados da interface

Loading é mostrado por texto (“Preparando sua estação…”, “Carregando área master…”). Listas têm estados vazios. Mensagens operacionais usam blocos e `role=alert` em alguns lugares; cores e tom de sucesso/erro nem sempre são distintos.

Há `confirm()`/`alert()` nativos em inativação e reset. Não foi identificado uso dos dialogs e toasts da biblioteca para padronizar esses fluxos. A recuperação do login usa a mesma variável de erro, inclusive para sucesso de envio.

Falhas gerais/404 usam inglês, apesar de `lang=pt-BR` na raiz. Fallback do servidor usa `lang=en`. Meta descriptions globais terminam com uma frase incompleta. Sitemap usa base vazia.

## 7. Etiqueta física

Layout atual em `labelStyles`/`labelMarkup`:

1. Marca pequena com logo.
2. Tarja preta de tipo de produto.
3. Nome do produto em até duas linhas, caixa alta.
4. Abertura/manipulação com data e hora.
5. Validade com maior destaque tipográfico.
6. Conservação, lote, setor, inspeção e responsável.
7. QR Code no canto direito inferior, com legenda RASTREIO.

HTML é monocromático, com `@page` no tamanho escolhido, margem zero e `overflow:hidden`. Alguns metadados são cortados por ellipsis; fontes vão de 3,6 a 11,5 pt no layout base. É preciso verificar legibilidade e leitura do QR em papel real, sobretudo em 50 × 30 mm.

O CSS global ainda inclui `.thermal-label` e um bloco de impressão fixo em 60 × 40 mm, mas não há elemento com essa classe no JSX atual. O fluxo ativo usa iframe e classes `.tl`. Esse legado pode confundir futuras mudanças.

Canvas NiiMbot mantém outra rotina de layout. A equivalência de preview e impressão é válida para o caminho HTML, não uma garantia para o PNG. O campo `issued` existe no objeto, mas não aparece na etiqueta física atual.

## 8. Acessibilidade e consistência

Pontos favoráveis no código: rótulos envolvendo controles, botões com `aria-label` em várias ações de ícone, textos além de cores para situação, idioma principal definido, foco em Button e primitives Radix no menu.

Pontos pendentes de verificação ou ajuste futuro: contraste medido, teclado em fluxos completos, zoom 200%, leitor de tela, tamanho de alvos secundários, comunicação de falhas de gravação, relação de rótulos master com inputs dentro de wrappers, overflow mobile, loading/busy de impressão e mensagens em português. Há cores fixas emerald/amber/zinc em badges master, fora dos tokens semânticos.

O design system fornece uma base reutilizável, mas ainda não há catálogo visual/Storybook, documentação de estados por componente, ensaios automatizados de acessibilidade ou guideline compartilhada de composição das telas.

## Dropdowns do sistema

Os seletores visíveis usam `src/components/ui/system-select.tsx`, apoiado no Select do Radix existente. Cadastro de empresas, produtos, importação, equipe, filtros, paginação, emissão, impressoras e área master compartilham a mesma superfície: fundo do tema, bordas arredondadas, sombra, foco verde e indicação da opção selecionada. O menu usa portal, respeita o espaço disponível e permite rolagem em listas longas.

O componente mantém as opções JSX e eventos dos formulários existentes. Um select nativo oculto preserva a validação obrigatória e os dados do formulário; quando inválido, o foco retorna ao controle visível e uma mensagem informa que é necessário selecionar uma opção. Setas, Home, End, Enter, busca por digitação e Escape usam a navegação acessível do Radix. O menu aberto fecha com Escape antes do modal.

Verificação em navegador com dados locais: seleção por mouse e teclado, envio e validação obrigatória, fieldset desabilitado, lista de 70 opções em modal e layout de 375 px. Nenhum dado de teste enviado ao banco.
