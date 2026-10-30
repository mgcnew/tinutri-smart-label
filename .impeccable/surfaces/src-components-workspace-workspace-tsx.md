---
version: 1
slug: "src-components-workspace-workspace-tsx"
primary_target: "src/components/workspace/Workspace.tsx"
related_targets: ["src/styles.css","src/components/ValidadesPanel.tsx","src/components/LabelWorkspaceNav.tsx","src/components/AuthLogin.tsx","src/routes/label.$token.tsx"]
---

# Surface brief: estação de trabalho (app autenticado) no celular e na AR-SP5

Mode: Operate. Pedido (29/10/2026): nova identidade visual com foco em celular e no terminal Arny AR-SP5 (Android, 5,45", 720×1440 → ~360×720 CSS px), que será oferecido como serviço agregado. Telas prioritárias: emissão de etiquetas, validades (PVPS), login e navegação, página do QR. Na rodada de direção o usuário escolheu o padrão da categoria; não indicou apps de referência. A régua de acabamento adotada é a dos melhores apps de gestão móvel brasileiros (Nubank, iFood para Parceiros).

## Direction contract
THESIS: o padrão da categoria executado sem concessões: um app móvel de gestão de cozinha em que validade e emissão estão a um toque, recusando o painel de desktop espremido no celular (menu escondido, títulos enormes e filtros ocupando a primeira tela).
OWN-WORLD: fundo cinza-esverdeado claro, superfícies brancas com sombra leve deslocada para baixo, verde #007a46 para ação principal e seleção, vermelho/âmbar/verde só para estados de validade, Manrope em escala curta, cantos de 14px, ícones de traço lucide, números tabulares.
STORY: o operador abre o app, vê o que venceu e o que vence hoje, emite uma etiqueta ou dá baixa sem procurar menu; o gestor tem o mesmo shell com mais seções.
FIRST VIEWPORT: cabeçalho compacto (marca, empresa, avatar); título curto da seção; conteúdo útil já na primeira tela; barra inferior fixa Início · Emitir · Validades (selo de urgentes) · Histórico · Menu, alvos de 48px+; no desktop, a barra lateral atual permanece.
FORM: padrão da categoria (saída canônica), escolhido pelo usuário; seed:23ed12717e6d5d63.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
