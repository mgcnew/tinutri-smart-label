---
name: "TiNutri Smart Label — Public Landing"
description: "The shipped public landing visual system, derived from the operational app."
colors:
  green: "#007a46"
  green-dark: "#005e36"
  ink: "#253a30"
  muted: "#5e7066"
  line: "#e2eae5"
  page: "#f7f9f8"
  tint: "#edf6f0"
  white: "#fff"
  tab-track: "#f0f4f1"
  preview-ground: "#f3f7f4"
  status-ink: "#36614b"
  attention-ink: "#934412"
  attention-ground: "#fff4e9"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 60px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(27px, 2.8vw, 37px)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  panel-title:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.65
  action:
    fontFamily: "Manrope, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  paper: "2px"
  status: "6px"
  tab: "7px"
  field: "9px"
  control: "10px"
  primary: "11px"
  contact: "14px"
  tour: "18px"
spacing:
  compact: "7px"
  small: "12px"
  medium: "15px"
  control-gap: "20px"
  large: "24px"
  panel: "32px"
  section-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.primary}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
  button-login:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 15px"
  button-small:
    backgroundColor: "{colors.white}"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.tab}"
    padding: "7px 11px"
  select:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 13px"
    width: "100%"
  status:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.status-ink}"
    rounded: "{rounded.status}"
    padding: "5px 10px"
  status-attention:
    backgroundColor: "{colors.attention-ground}"
    textColor: "{colors.attention-ink}"
  tab-active:
    backgroundColor: "{colors.white}"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.tab}"
    padding: "8px 14px"
  tour:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.tour}"
---

# Design System: TiNutri Smart Label — Public Landing

## Overview

**Creative North Star: "The Organized Workbench"**

The organized workbench brings the calm, practical character of the operational application to the public landing. White surfaces, green actions, fine divisions and compact controls make the product legible without decorative imagery.

This document covers only the public landing rendered by `src/components/landing/SystemLanding.tsx`, styled by `src/landing.css` and routed at `src/routes/sistema.tsx` (also reused at the public entry point). It does not redefine the authenticated application, shared authentication dialog, print templates or dark theme. The source implementation wins over the earlier direction contract: its division color is `colors.line`, and section headings inherit the existing DM Sans display family.

**Key Characteristics:**

- White surfaces with functional green emphasis.
- Calm density, generous section spacing and compact operational controls.
- Readable native controls and visible keyboard focus.
- Locally interactive examples clearly identified as fictitious.

## Colors

A single brand-green family anchors a white and pale green-gray environment. Frontmatter values are normative; names below describe their uses.

### Primary

- **Brand Green** (`green`): primary contact actions, hero emphasis, functional icons and focus outline.
- **Deep Green** (`green-dark`): primary hover and selected-control text.
- **Soft Green** (`tint`): restrained status and icon backgrounds.

### Neutral

- **White** (`white`): page, controls, label paper and primary-action text.
- **Kitchen Ink** (`ink`): main text.
- **Muted Green Gray** (`muted`): supporting copy and inactive navigation.
- **Fine Division** (`line`): recurring group and row borders.
- **Pale Page** (`page`), **Tab Track** (`tab-track`) and **Preview Ground** (`preview-ground`): quiet differentiation of interface layers.

The semantic status pair uses `status-ink` on `tint`. Attention uses `attention-ink` on `attention-ground`, always accompanied by text; amber is not a second promotional accent.

**The Functional Green Rule.** Use green for primary actions, selected controls, operational icons and concise heading emphasis. Reserve the amber pair for an attention status.

## Typography

**Display Font:** Manrope with sans-serif fallback for the hero; DM Sans with UI/system sans-serif fallbacks for section and product headings.

**Body Font:** Manrope with sans-serif fallback.

**Character:** Familiar application typography, moderate semibold emphasis and slightly tightened headings. There is no new campaign display face.

### Hierarchy

- **Display:** `typography.display` for the main introduction. At the mobile breakpoint it becomes `clamp(32px, 7.8vw, 48px)`.
- **Headline:** `typography.headline` for the routine and FAQ hierarchy; people headings use a fixed 30px desktop size. Mobile routine and FAQ headings are 29px; people headings are 28px.
- **Panel title:** `typography.panel-title` for operational stages; mobile size is 24px.
- **Body:** `typography.body` is the page base. Introductory copy uses line-height 1.8 and a 56ch maximum. Ordinary explanatory copy uses 13–14px with generous leading.
- **Label:** `typography.label` for fields, with smaller 11px operational metadata. The paper facsimile uses 10px fine detail and tabular numerals for dates; these are specialized demonstration values, not a general body-text scale.
- **Action:** `typography.action` for primary buttons; mobile primary text is 12px. Native selects become 16px on mobile.

**The Existing Type Rule.** Use the existing Manrope and DM Sans families; retain the Manrope hero override and the inherited DM Sans section headings.

## Layout

The centered container is `min(1120px, calc(100% - 64px))`; at 720px and below it becomes `calc(100% - 36px)`. The header is at least 84px tall, reducing to 72px on mobile. Its section links are hidden at the mobile breakpoint while brand and login remain.

Desktop uses balanced two-column arrangements for the demonstration and routine explanation, and a 0.85/1.15 split for people and FAQ content. The introduction pairs flexible copy with an auto-width action. At 1000px and below the introduction stacks and larger gaps reduce. At 720px and below content grids become one column, tabs share the available width, validity rows reflow and footer links stack.

Compact controls use small gaps from the recorded spacing steps; this is an observed vocabulary rather than a rigid modular scale. Desktop routine and FAQ sections use 88px and 80px vertical padding, respectively; mobile uses 55px and 50px. Demonstration panels have a 440px minimum height. They use roughly 32px vertical padding with 40–42px horizontal padding on desktop and 20–21px horizontal padding on mobile. Anchor targets have a 100px scroll margin.

## Elevation & Depth

Depth is chiefly tonal and bordered. It carries only three subtle, downward ambient shadows; ordinary explanation rows and FAQ items remain flat.

### Shadow Vocabulary

- **Tour:** `0 12px 40px -24px rgb(31 69 46 / 0.22)` for the main product container.
- **Selected tab:** `0 2px 6px -2px rgb(31 69 46 / 0.16)` for the active white tab.
- **Label paper:** `0 8px 19px -12px rgb(31 69 46 / 0.3)` for the illustrative paper preview.

**The Quiet Depth Rule.** Use borders and pale tonal grounds for ordinary grouping; reserve soft shadows for the product container, selected tab and illustrative label.

## Shapes

Gently rounded rectangular controls use the frontmatter radius vocabulary: smaller status and tab corners, medium field and button corners, and broader tour/contact corners. The tour reduces to 13px corners on mobile. The label paper is intentionally almost square; timeline icon carriers are circular. Thin solid borders and straight list divisions keep the page organized. Lucide stroke icons support the adjacent text.

## Components

### Buttons

Practical controls with restrained emphasis. The primary variant uses the brand-green fill and white text, a 50px minimum height, the recorded primary radius and padding; mobile height is 48px. Hover darkens the fill over 0.18s. Login is white with a fine border and a pale-page hover. The small simulation button is white with green-dark text and a pale green border; when disabled its border becomes transparent and text muted. Login, small actions and undo retain 44px minimum height.

All focusable descendants receive a 2px green focus-visible outline with 4px offset. Shared Radix tabs also retain their component focus ring. Reduced-motion preference removes landing transitions and smooth scroll behavior.

### Chips

Compact status labels use the recorded status radius and padding. The attention variant switches both foreground and ground; text describes the state. These are informational labels, not filter controls.

### Cards / Containers

A single large bordered product container carries the tour shadow and rounded silhouette. Its top bar uses 19px 25px padding and a fine bottom divider. The preview pane has a pale green-gray ground and a nearly square white paper inset with 22px padding. The closing contact panel uses its own pale green ground (`#f1f8f3`), fine border and contact radius. Repeated explanatory content uses rows and divisions rather than standalone cards.

### Inputs / Fields

The demonstration uses native labeled selects, not custom text inputs. Each is full width, white, finely bordered (`#dce4df`), softly rounded and at least 44px tall. The green focus outline is shared with other controls. Desktop text is 13px; mobile text is 16px. No landing field error state is implemented.

### Navigation

The header uses muted 13px text links that become green on hover and have 44px minimum height. The product stage selector is a padded pale track with 44px tab buttons; the active tab is white with green-dark text and the selected-tab shadow. On mobile its three tabs distribute evenly across the container.

### Operational demonstration

The three stages share the same product container and type hierarchy. Product and label-type selection update the paper preview. A simulated usage action updates validity and history locally, with a visible status message and undo. The timeline uses circular icon markers, divided rows and muted timestamps. Example notices stay visible; the illustration neither prints nor persists data.

### FAQ disclosure

Native details/summary rows use thin divisions, semibold question text and a small chevron. Opening rotates the chevron 180 degrees over 0.18s; answer copy is muted with generous leading. Summary rows are at least 67px high.

## Do's and Don'ts

### Do:

- **Do** preserve the white and green operational identity and established typography.
- **Do** keep interactive controls at least 44px tall and show visible keyboard focus.
- **Do** retain labels, text status explanations and explicit fictitious-data notices in the demonstration.
- **Do** stack columns and reflow rows on small screens instead of squeezing the desktop layout.

### Don't:

- **Don't** introduce photography, olive colors, editorial serif faces or decorative background lettering into this landing.
- **Don't** replace clear groups and dividers with a mosaic of promotional cards.
- **Don't** use the illustrative label styling as a specification for physical printed labels.
- **Don't** apply this landing document to the whole authenticated application.
