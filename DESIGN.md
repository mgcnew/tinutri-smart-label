---
name: "TiNutri Smart Label"
description: "Mobile-first kitchen management app (authenticated workspace, login and QR consultation), plus the separately documented public landing."
colors:
  brand-green: "#007a46"
  page: "#f3f5f4"
  surface: "#ffffff"
  surface-soft: "#f4f7f5"
  tint-green: "#edf6f0"
  tint-neutral: "#f1f3f2"
  ink: "#1d2b24"
  ink-soft: "#63736a"
  line: "#e5ebe7"
  line-input: "#dce4df"
  line-green: "#d6e9dc"
  line-green-strong: "#a2c6b0"
  ok-ink: "#25623d"
  ok-bg: "#f3faf5"
  warn-ink: "#934412"
  warn-bg: "#fff4e9"
  bad-ink: "#a5322a"
  bad-bg: "#fff6f5"
  bad-line: "#f1d8d6"
  destructive: "#c0352b"
  landing-green-dark: "#005e36"
  landing-ink: "#253a30"
  landing-muted: "#5e7066"
  landing-line: "#e2eae5"
  landing-page: "#f7f9f8"
  landing-tab-track: "#f0f4f1"
  landing-preview-ground: "#f3f7f4"
  landing-status-ink: "#36614b"
typography:
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 3vw, 32px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  numeral:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  data:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
  landing-display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 60px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  landing-headline:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(27px, 2.8vw, 37px)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  landing-panel-title:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  landing-body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  landing-label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.65
  landing-action:
    fontFamily: "Manrope, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  chip: "6px"
  field: "10px"
  control: "12px"
  tile: "14px"
  card: "22px"
  sheet: "26px"
  pill: "999px"
  landing-paper: "2px"
  landing-tab: "7px"
  landing-field: "9px"
  landing-primary: "11px"
  landing-tour: "18px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  card: "20px"
  section: "24px"
  page-y: "28px"
  page-x: "32px"
  landing-compact: "7px"
  landing-medium: "15px"
  landing-section-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "46px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  metric-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.lg}"
  alert-strip-bad:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "12px 14px"
  alert-strip-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "12px 14px"
  validity-chip-expired:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
  validity-chip-today:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
  validity-chip-soon:
    backgroundColor: "{colors.tint-green}"
    textColor: "{colors.ok-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
  tabbar:
    backgroundColor: "{colors.surface}"
    padding: "6px 4px"
  tab:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "56px"
  tab-active:
    backgroundColor: "{colors.tint-green}"
    textColor: "{colors.brand-green}"
    rounded: "{rounded.pill}"
    width: "52px"
    height: "30px"
  tab-emit:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    width: "52px"
    height: "30px"
  tab-badge:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "18px"
  sidebar-item-active:
    backgroundColor: "{colors.tint-green}"
    textColor: "{colors.brand-green}"
    rounded: "9px"
    height: "44px"
  landing-button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.surface}"
    typography: "{typography.landing-action}"
    rounded: "{rounded.landing-primary}"
    padding: "13px 22px"
  landing-button-primary-hover:
    backgroundColor: "{colors.landing-green-dark}"
  landing-button-login:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.landing-ink}"
    rounded: "{rounded.field}"
    padding: "8px 15px"
  landing-button-small:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.landing-green-dark}"
    rounded: "{rounded.landing-tab}"
    padding: "7px 11px"
  landing-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.landing-ink}"
    rounded: "{rounded.landing-field}"
    padding: "10px 13px"
    width: "100%"
  landing-status:
    backgroundColor: "{colors.tint-green}"
    textColor: "{colors.landing-status-ink}"
    rounded: "{rounded.chip}"
    padding: "5px 10px"
  landing-status-attention:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
  landing-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.landing-green-dark}"
    rounded: "{rounded.landing-tab}"
    padding: "8px 14px"
  landing-tour:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.landing-tour}"
---

# Design System: TiNutri Smart Label

## Overview

**Creative North Star: "The Kitchen Pocket App"**

The authenticated app is the category standard for a mobile management app, executed at full craft: a pale green-gray ground, white lifted cards, one green for action and selection, and red, amber and green only when a validity state exists. It is built for a phone held in one hand in a bright, busy kitchen and for the Arny AR-SP5 terminal (about 360 × 720 CSS px). Validity and emission are one tap away; the expiry date is always the most legible thing on the screen.

This document has three scopes. **Part A (primary system)** covers the authenticated workspace (`src/components/workspace/Workspace.tsx` and the panels it hosts), the login (`src/components/AuthLogin.tsx`, both the dialog and the full page) and the public QR consultation page (`src/routes/label.$token.tsx`), styled by `src/styles.css`. **Part B** preserves the public landing system (`src/components/landing/SystemLanding.tsx`, `src/landing.css`), which keeps its own neutrals and DM Sans section headings; its tokens carry the `landing-` prefix. **The thermal print label** (`.thermal-label`, Arial, 60 × 40 mm) is a print artifact outside both UI systems; its rules are fixed by the printer, not by this document.

The app has a dark theme (`.dark`) that remaps the same token names; the login always renders in the light tokens, even in dark mode.

**Key Characteristics:**

- One family (Manrope) in a short scale; heavy, tight page titles; tabular numerals for every date and count.
- White cards with a soft downward shadow on a green-gray ground; no decorative imagery.
- Green means action or selection; red, amber and green tones mean a validity state and never decorate.
- Bottom tab bar below 1024px, sidebar at 1024px and above; 44–56px touch targets throughout.
- Lucide stroke icons always paired with text.

## Colors

A single brand green on a cool green-gray ground, with three state pairs held in reserve. Frontmatter values are normative.

### Primary

- **TiNutri Green** (`brand-green`): primary buttons, the raised Emitir tab, the active tab and sidebar text, the sidebar's 3px active bar, focus rings (`--ring`) and the selected state of options. Hover and pressed fills darken it with `color-mix(in oklab, … 82–85%, black)`.
- **Green Mist** (`tint-green`): selected backgrounds (active tab pill, active sidebar item, chosen option, step numbers in the emission form, avatar), and the ground of the "soon" validity tone.
- **Green Hairline** (`line-green`) and **Green Edge** (`line-green-strong`): borders of green-tinted areas and of hovered or selected tiles and choices.

### State pairs

- **Expired** (`bad-ink` on `bad-bg`, border `bad-line`): expired labels, the expired alert strip, discard choices.
- **Due today** (`warn-ink` on `warn-bg`): labels expiring today and the "due today" alert strip.
- **Within window** (`ok-ink` on `tint-green` or `ok-bg`): labels expiring soon, chosen non-destructive settlement options.
- **Later** (`ink-soft` on `tint-neutral`): labels comfortably within their validity.
- **Alarm Red** (`destructive`): the single red fill: "Ver vencidas" and "Confirmar descarte" buttons, the urgent-count badge on the Validades tab, the expired status pill and the expired date on the QR page, invalid-field borders.

### Neutral

- **Kitchen Ground** (`page`): the app background behind every card.
- **White** (`surface`): cards, header, tab bar, sidebar, inputs and text on green or red fills.
- **Soft Surface** (`surface-soft`): hover rows, pressed tabs, role badge, password field at rest.
- **Neutral Tint** (`tint-neutral`): ground for the "later" tone.
- **Deep Ink** (`ink`): all primary text.
- **Soft Ink** (`ink-soft`): secondary copy, inactive tabs and navigation, metadata.
- **Hairline** (`line`) and **Field Line** (`line-input`): card and divider borders; input borders.

### Dark theme

`.dark` keeps every token name and swaps values: ground `#0f1612`, surface `#17201b`, soft surface `#1d2822`, ink `#e6efe9`, soft ink `#9db0a5`, hairline `#2a3830`; green text and rings move to `#4cc58a` (`--brand-ink`) while green fills stay `brand-green`; state inks become `#7fd4a0`, `#f3b27a` and `#f29a92` on dark grounds.

**The State-Only Color Rule.** Red, amber and state green appear only when a validity or status state exists, and always beside text that names it ("Vencidas", "Já venceu", "Vence hoje"). A count of zero falls back to `ink-soft`.

**The One Red Rule.** `destructive` is the only red fill in the app; `bad-ink` is the red for text and icons on `bad-bg`. No other reds, and no Tailwind palette colors in place of the state pairs.

## Typography

**Display Font:** Manrope (with ui-sans-serif, system-ui fallback)
**Body Font:** Manrope
**Label/Mono Font:** Manrope with tabular numerals (`tnum`) for dates, times and counts

**Character:** One geometric-humanist family in a short scale; weight, not a second face, makes hierarchy. Page titles are extra-bold and tight; everything else stays at 600 or lighter.

### Hierarchy

- **Headline** (`typography.headline`): one page title per view ("Olá, Administrador.", "Validades", "Emitir etiqueta"). Below 640px it becomes 22px. The QR page's product name uses the same weight at 24px, uppercase to match the printed label.
- **Title** (`typography.title`): card and panel headings; emission group headings use 16px.
- **Numeral** (`typography.numeral`): metric counts in tiles (dashboard counts reach 36px on larger screens; the four-number validity strip on phones uses 24px, centered, colored by its tone).
- **Body** (`typography.body`): the app base (14px); explanatory notes use 12–13px with generous leading.
- **Data** (`typography.data`): validity chips and dates. The QR page shows the expiry date at `clamp(22px, 7.2vw, 30px)` bold, tabular.
- **Label** (`typography.label`): field labels, tab labels (active tab 700), badges, metadata. 12px is the floor for any text in the app.

Inputs, selects and textareas render at 16px below 640px so iOS never zooms on focus.

**The One Family Rule.** Inside `.workspace-shell`, `.auth-dialog` and `.label-page`, `--font-display` resolves to Manrope; DM Sans belongs to the landing only.

**The Tabular Date Rule.** Every date, time, count and badge number uses tabular numerals so columns and countdowns never jitter.

## Layout

**Below 1024px** the app is a single column under a compact header (brand, company, avatar; 64px tall, 56px below 640px, padded for the top safe area) with a fixed bottom tab bar: Início · Emitir · Validades · Histórico · Menu. Main content reserves `96px + safe-area` at the bottom so nothing hides under the bar. The emission form's action row becomes a sticky white bar just above the tab bar. **At 1024px and above** the tab bar disappears and a 240px fixed sidebar (white, right hairline) carries navigation; content centers at a 1280px maximum.

Main padding is `page-y` × `page-x` on desktop and 20px × `lg` below 640px. Sections stack with `section` gaps (16px on phones), cards pad with `card` (16px on phones for filters), tiles with `lg`, and rows of controls gap with `sm`–`md`. On phones the first viewport carries useful content: the Validades view orders title, a four-number overview strip and the list before extra filters, which open on demand; secondary explanatory notes are hidden.

**The Thumb Zone Rule.** Primary navigation lives in the bottom bar on phones and the AR-SP5; nothing essential is hidden behind a top hamburger. Tabs are at least 56px tall; every other control at least 44px (inputs 46–48px, settlement choices 48–68px).

## Elevation & Depth

A light hybrid: tonal separation (white cards on the green-gray ground) does most of the work, and a soft, downward, green-tinted shadow lifts cards off it. Rows inside cards stay flat and separate with hairlines.

### Shadow Vocabulary

- **Card** (`--shadow-card`: `0 1px 2px rgb(16 40 28 / 5%), 0 8px 18px -12px rgb(16 40 28 / 16%)`): emission form, validity groups, client cards.
- **Tab bar** (`0 -8px 20px -14px rgb(16 40 28 / 22%)`): the upward shadow of the fixed bottom bar; the sticky emission action bar uses a lighter `0 -8px 16px -8px rgb(27 65 44 / 10%)`.
- **Emit tab** (`0 4px 10px -4px rgb(0 94 54 / 45%)`): the raised green Emitir pill.
- **Popover** (`0 12px 32px rgb(20 50 35 / 16%)`): select menus and floating lists.
- **Login card** (`0 8px 32px rgb(27 65 44 / 4%)`): the login card when it floats; removed when the login goes full screen.

**The Soft Lift Rule.** Shadows are diffuse, downward and green-black at low opacity. No hard offset shadows and no heavy drop shadows on cards.

## Shapes

Generously rounded rectangles, rounder as the container grows: chips (`chip`), fields (`field`), buttons and tab hit areas (`control`), metric tiles and alert strips (`tile`, the `--radius` base), cards and dialogs (`card`), and the QR page's sheets (`sheet`). Pills (`pill`) for the tab icon carrier, the urgent badge and the QR status pill. The avatar is a circle. Borders are 1px hairlines; the active sidebar item adds a 3px green bar on its left edge; active label-step tabs on desktop use a 2px green underline.

## Components

### Buttons

Plain and confident. **Primary** is `brand-green` with white text, `control` radius, 44px tall on touch screens (36px with a fine pointer); hover darkens the fill. The login submit is 50px, 11px radius, with a trailing arrow that nudges 3px on hover. **Destructive** uses `destructive` and is reserved for acting on expired or discarded items. **Outline** is a hairline-bordered neutral button for secondary actions. Disabled controls drop to 50–60% opacity. Focus is a 2px ring-colored outline with 2px offset (3px on the login).

### Chips

**Validity chips** (`validity-chip-*`) name the state in text, colored by tone, 13px bold tabular. **Count chips** in group headers use 12px with the same tone pair. **Role badge** in the header is `surface-soft` with 12px text. Chips are informational, never filters.

### Cards / Containers

- **Corner Style:** `card` for panels, forms and dialogs; `tile` for metric tiles and alert strips; `sheet` on the QR page.
- **Background:** `surface` on `page`; inner informational panels may use `tint-green` or `surface-soft`.
- **Shadow Strategy:** the Card shadow (see Elevation).
- **Border:** 1px `line`.
- **Internal Padding:** `card` (20px), 16px on phones.

### Inputs / Fields

White, 1px `line-input`, `field` radius, 46px minimum (48px on the login, where the resting field is `surface-soft` and turns white on focus). Focus shifts the border to the ring color with a 3px ring-tinted halo (14–22% opacity). Invalid selects take a `destructive` border. The custom select trigger (`.system-select-trigger`) matches inputs; its menu is a `surface` popover with 12px radius and 40px options, highlighted with `tint-green`.

### Navigation

**Bottom tab bar** (below 1024px): white, top hairline, five equal columns, safe-area padded. Each tab is a 56px column with a 22px stroke icon over a 12px label in `ink-soft`. The active tab turns `brand-green`, weight 700, with a 52 × 30px `tint-green` pill behind the icon. **Emitir** is always the filled green pill with white icon and its own shadow. The Validades tab carries a red count badge (white 2px ring, tabular, "99+" cap) for labels expired or due today. **Sidebar** (1024px and above): 44px items, 13px `ink-soft` text; active is `tint-green` with green 600 text and the left bar. **Label steps** (Emitir / Validades / Histórico) show as underlined tabs on desktop and are hidden on phones, where the bottom bar already separates them.

### Alert strip

A compact tile shown on any view while labels are expired or due today; it has no close button and disappears only when the labels are settled. Bad or warn tone ground and border, 22px warning icon in the tone ink, a 14px semibold tabular summary and one action. On phones the explanatory note and the secondary action are hidden. When only upcoming labels exist it degrades to a neutral white card with an outline button.

### Validity overview and groups

Four metric tiles (Vencidas, Vencem hoje, Próximas de vencer, Dentro do prazo). On phones they form one four-column strip of centered numerals in their tone with 12px labels underneath. Groups are cards with a tone-colored 36px icon carrier, a title, a count chip and flat rows; each row leads with the product name and the validity chip, then muted metadata with tabular dates. Settlement happens in a dialog with 68px choice cards; the discard choice selects in the bad tone.

### Login

A centered 440px card (24px radius, 20px below 480px) with a `tint-green` brand band holding the logo on a white rounded plate. At 480px and below, the login dialog fills the screen like an app entry, with safe-area padding and no frame or shadow.

### QR consultation page

A 448px column of `sheet` cards. The product name leads, followed by the status pill and the expiry date on a tone ground (`bad-bg`, `warn-bg` or `surface-soft`), then a definition list of 12px uppercase muted terms against semibold values. Settlement uses three 48px outline buttons in a row and a full-width destructive confirmation for discards.

### Thermal label (print artifact, outside the system)

`.thermal-label` is a fixed 60 × 40 mm Arial layout in pure black on white, sized in points and millimetres for the thermal printer. It does not follow the app's type, color or radius tokens, and app tokens must not be derived from it.

## Do's and Don'ts

### Do:

- **Do** keep the expiry date the most legible element of any label, row or page, in tabular numerals.
- **Do** use `brand-green` for the one primary action per view and for selection; keep everything else neutral.
- **Do** pair every state color with text naming the state, and use the token pairs (`bad-*`, `warn-*`, `ok-*`).
- **Do** keep touch targets at 44px minimum, 56px for tabs, and inputs at 16px on phones.
- **Do** keep primary navigation in the bottom bar below 1024px and in the sidebar at 1024px and above.
- **Do** put useful content in the first phone viewport and move secondary filters behind an on-demand control.
- **Do** respect safe areas at the top and bottom, and `prefers-reduced-motion` (all transitions collapse).

### Don't:

- **Don't** use DM Sans or any second family inside the authenticated app, login or QR page.
- **Don't** use red, amber or state green as decoration, or introduce a second red or Tailwind palette oranges and reds in place of the state tokens.
- **Don't** use the shadcn amber `--accent` for states or hovers; it is not part of this system.
- **Don't** add uppercase tracked eyebrows or kickers above page titles.
- **Don't** add hard offset shadows or heavy drop shadows to cards.
- **Don't** squeeze the desktop dashboard onto phones: no hidden top menus, oversized titles or filters filling the first screen.
- **Don't** derive UI styling from the thermal print label, or print-label specs from the UI.

## Part B: Public Landing

The public landing keeps the system it shipped with, documented here unchanged except for token names (now prefixed `landing-`, or pointing at a shared token where the value is identical). It is rendered by `src/components/landing/SystemLanding.tsx`, styled by `src/landing.css` and routed at `src/routes/sistema.tsx` (also reused at the public entry point). Part A does not apply to it, and it does not apply to Part A.

**Creative North Star: "The Organized Workbench"**

The organized workbench brings the calm, practical character of the operational application to the public landing. White surfaces, green actions, fine divisions and compact controls make the product legible without decorative imagery. The source implementation wins over the earlier direction contract: its division color is `landing-line`, and section headings inherit the DM Sans display family.

**Key Characteristics:**

- White surfaces with functional green emphasis.
- Calm density, generous section spacing and compact operational controls.
- Readable native controls and visible keyboard focus.
- Locally interactive examples clearly identified as fictitious.

### Landing colors

- **Brand Green** (`brand-green`): primary contact actions, hero emphasis, functional icons and focus outline.
- **Deep Green** (`landing-green-dark`): primary hover and selected-control text.
- **Soft Green** (`tint-green`): restrained status and icon backgrounds.
- **White** (`surface`): page, controls, label paper and primary-action text.
- **Kitchen Ink** (`landing-ink`): main text.
- **Muted Green Gray** (`landing-muted`): supporting copy and inactive navigation.
- **Fine Division** (`landing-line`): recurring group and row borders.
- **Pale Page** (`landing-page`), **Tab Track** (`landing-tab-track`) and **Preview Ground** (`landing-preview-ground`): quiet differentiation of interface layers.

The semantic status pair uses `landing-status-ink` on `tint-green`. Attention uses `warn-ink` on `warn-bg`, always accompanied by text; amber is not a second promotional accent.

**The Functional Green Rule.** Use green for primary actions, selected controls, operational icons and concise heading emphasis. Reserve the amber pair for an attention status.

### Landing typography

- **Display:** `typography.landing-display` (Manrope) for the main introduction; mobile `clamp(32px, 7.8vw, 48px)`.
- **Headline:** `typography.landing-headline` (DM Sans) for the routine and FAQ hierarchy; people headings use a fixed 30px desktop size. Mobile routine and FAQ headings are 29px; people headings are 28px.
- **Panel title:** `typography.landing-panel-title` (DM Sans) for operational stages; mobile 24px.
- **Body:** `typography.landing-body` is the page base. Introductory copy uses line-height 1.8 and a 56ch maximum; ordinary explanatory copy uses 13–14px with generous leading.
- **Label:** `typography.landing-label` for fields, with smaller 11px operational metadata. The paper facsimile uses 10px fine detail and tabular numerals for dates; these are demonstration values, not a general scale.
- **Action:** `typography.landing-action` for primary buttons; mobile 12px. Native selects become 16px on mobile.

**The Existing Type Rule.** Use the existing Manrope and DM Sans families on the landing; retain the Manrope hero override and the inherited DM Sans section headings.

### Landing layout

The centered container is `min(1120px, calc(100% - 64px))`; at 720px and below it becomes `calc(100% - 36px)`. The header is at least 84px tall, 72px on mobile; its section links hide at the mobile breakpoint while brand and login remain. Desktop uses balanced two-column arrangements for the demonstration and routine explanation, and a 0.85/1.15 split for people and FAQ content. At 1000px and below the introduction stacks; at 720px and below content grids become one column, tabs share the width, validity rows reflow and footer links stack. Compact controls use small gaps (`landing-compact`, `md`, `landing-medium`, `card`); routine and FAQ sections use 88px and 80px vertical padding on desktop, 55px and 50px on mobile. Demonstration panels have a 440px minimum height, roughly 32px vertical padding with 40–42px horizontal padding on desktop and 20–21px on mobile. Anchor targets have a 100px scroll margin; `landing-section-gap` separates major blocks.

### Landing elevation and shapes

Depth is chiefly tonal and bordered, with three subtle downward shadows: **Tour** `0 12px 40px -24px rgb(31 69 46 / 0.22)` on the main product container, **Selected tab** `0 2px 6px -2px rgb(31 69 46 / 0.16)`, **Label paper** `0 8px 19px -12px rgb(31 69 46 / 0.3)`. Explanation rows and FAQ items stay flat.

**The Quiet Depth Rule.** Use borders and pale tonal grounds for ordinary grouping; reserve soft shadows for the product container, selected tab and illustrative label.

Radii: `chip` for status, `landing-tab` for tabs and small buttons, `landing-field` for selects, `field` for login, `landing-primary` for the primary button, `tile` for the contact panel and `landing-tour` for the tour (13px on mobile). The label paper (`landing-paper`) is almost square; timeline icon carriers are circular. Lucide stroke icons support adjacent text.

### Landing components

- **Buttons:** primary is `brand-green` with white text, 50px minimum height (48px mobile), hover to `landing-green-dark` over 0.18s. Login is white with a fine border and pale-page hover. The small simulation button is white with green-dark text and a pale green border; disabled, its border goes transparent and text muted. Login, small actions and undo keep 44px minimum height. All focusable descendants get a 2px green focus-visible outline with 4px offset; reduced motion removes transitions and smooth scrolling.
- **Chips:** compact status labels; the attention variant switches foreground and ground, and text describes the state. Informational, not filters.
- **Cards / Containers:** one large bordered product container with the tour shadow; its top bar uses 19px 25px padding and a fine divider. The preview pane has a pale ground and a nearly square white paper inset with 22px padding. The contact panel uses its own pale green ground (`#f1f8f3`). Repeated content uses rows and divisions rather than standalone cards.
- **Inputs:** native labeled selects, full width, white, bordered `#dce4df`, at least 44px tall; 13px desktop, 16px mobile. No error state is implemented.
- **Navigation:** muted 13px header links turning green on hover, 44px minimum height. The stage selector is a padded `landing-tab-track` with 44px tab buttons; the active tab is white with green-dark text and the selected-tab shadow; on mobile the three tabs share the width.
- **Operational demonstration:** three stages in one container; product and label-type selection update the paper preview; a simulated usage action updates validity and history locally with a status message and undo; the timeline uses circular icon markers, divided rows and muted timestamps. Example notices stay visible; nothing prints or persists.
- **FAQ disclosure:** native details/summary rows with thin divisions, semibold questions and a chevron rotating 180 degrees over 0.18s; summary rows at least 67px high.

### Landing do's and don'ts

- **Do** preserve the white and green operational identity and established typography.
- **Do** keep interactive controls at least 44px tall and show visible keyboard focus.
- **Do** retain labels, text status explanations and explicit fictitious-data notices in the demonstration.
- **Do** stack columns and reflow rows on small screens instead of squeezing the desktop layout.
- **Don't** introduce photography, olive colors, editorial serif faces or decorative background lettering into this landing.
- **Don't** replace clear groups and dividers with a mosaic of promotional cards.
- **Don't** use the illustrative label styling as a specification for physical printed labels.
