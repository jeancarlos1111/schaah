---
name: "SAHAD UBV — Eje Kerepakupai Vena"
description: "Sistema Automatizado para la Asignación de Horarios Académicos de los Docentes de la UBV"
colors:
  cobalt-solver: "#2f81f7"
  academic-emerald: "#238636"
  academic-emerald-hover: "#2ea043"
  bolivarian-crimson: "#f85149"
  status-green: "#3fb950"
  status-amber: "#d29922"
  status-teal: "#39c5bb"
  status-purple: "#a371f7"
  obsidian-canvas: "#090c10"
  midnight-header: "#0d1117"
  slate-surface: "#161b22"
  slate-surface-hover: "#1f242c"
  graphite-muted: "#21262d"
  border-medium: "#30363d"
  border-focus: "#388bfd"
  text-white: "#f0f6fc"
  text-body: "#c9d1d9"
  text-muted: "#8b949e"
  text-faint: "#6e7681"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-solver}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.slate-surface-hover}"
  button-table-action:
    backgroundColor: "{colors.graphite-muted}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.xs}"
    padding: "4px 8px"
  card-panel:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.md}"
    padding: "21.6px"
  input-search:
    backgroundColor: "{colors.midnight-header}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 10px 0 32px"
---

# Design System: SAHAD UBV — Eje Kerepakupai Vena

## Overview

**Creative North Star: "The Academic Command Matrix"**

SAHAD UBV projects the calm authority of an algorithmic command console engineered for public university timetabling. Built for academic planners, PFG coordinators, administrators, and faculty across the Eje Geopolítico Regional Kerepakupai Vena, the visual system treats high-density data—45-minute schedule matrices, 29-column `.xlsx` offer imports, CCU dedication thresholds (`DE`, `TC`, `MT`, `TV`), and curriculum trajectories—with surgical clarity. Every surface prioritizes immediate scannability, explicit action labeling, and normative traceability over decorative flourish.

The aesthetic philosophy draws from dark-first technical workspaces (Linear and GitHub Dark) adapted to institutional academic governance, paired with a high-contrast light mode for bright offices and projectors. It explicitly rejects ornamental gradients, unstyled native controls, ambiguous icon-only action capsules, and low-density marketing cards that waste vertical viewport space during intensive planning sessions.

**Key Characteristics:**
- Dark-first dual-theme architecture (`data-theme="dark"` default with seamless `data-theme="light"` parity).
- High-density tabular and matrix layouts (`SahadDataTable` and weekly availability/schedule grids) governed by server-side pagination and HTMX partial swaps.
- Explicit icon-plus-label affordances on every table and workflow action.
- Semantic status encoding for hard (`H-01`..`H-14`) and soft (`S-01`..`S-08`) normative rules, priorities (`P1`–`P3`), and curriculum hour breakdowns (`HT`, `HP`, `HC`).
- Venezuelan 12-hour civil time formatting (`hh:mm AM/PM`) with tabular numerals across all temporal views.

## Colors

The palette pairs deep obsidian and slate structural layers with high-signal semantic accents that distinguish interactive controls, normative approval, and institutional warnings at a glance.

### Primary
- **Cobalt Solver** (`--brand-accent`, `#2f81f7` in dark / `#0969da` in light): Primary interactive accent for main CTA buttons (`.btn-clean-primary`), active pagination states, link hovers, focus rings (`--border-focus`), Priority 2 availability cells, and theoretical hour chips (`.chip-ht`).

### Secondary
- **Academic Emerald** (`--brand-primary`, `#238636` in dark / `#1f883d` in light) and **Status Green** (`--accent-green`, `#3fb950` in dark / `#1a7f37` in light): Used for progress fills, Priority 1 (Alta) availability slots, active status pills (`.status-active`), and practical laboratory hour chips (`.chip-hp`).

### Tertiary
- **Bolivarian Crimson** (`--brand-ubv` / `--accent-red`, `#f85149` in dark / `#cf222e` in light): Institutional UBV emblem accent in the header wordmark and semantic danger color for hard constraint violations, destructive actions (`.text-danger`), and inactive states.
- **Status Amber** (`--accent-amber`, `#d29922` in dark / `#9a6700` in light): Used for Priority 3 (Baja) availability slots, third-party audit warnings (`.disp-motivo-panel`), community field hours (`.chip-hc`), and Proyecto Comunitario badges (`.badge-proyecto`).
- **Status Teal & Purple** (`--accent-teal` `#39c5bb`, `--accent-purple` `#a371f7`): Module category indicators and Bento top-bar accents.

### Neutral
- **Obsidian Canvas** (`--canvas-bg`, `#090c10` in dark / `#f6f8fa` in light): Root viewport background providing deep contrast behind elevated panels.
- **Midnight Header & Input Surface** (`--surface-header` / `--surface-input`, `#0d1117` in dark / `#ffffff` in light): Sticky 54px top navigation bar, footer, and recessed form/search inputs.
- **Slate Surface** (`--surface-card`, `#161b22` in dark / `#ffffff` in light) and **Slate Hover** (`--surface-card-hover`, `#1f242c` in dark / `#f3f4f6` in light): Primary container surface for `.clean-panel`, `.clean-stat-card`, `.clean-tile`, and table headers.
- **Graphite Muted & Borders** (`--surface-muted` `#21262d`, `--border-subtle` `#21262d`, `--border-medium` `#30363d`): Hairline structural dividers, subtle badges, unavailable matrix cells (`.is-nodisp`), and table action button backgrounds.
- **Text Hierarchy** (`--text-white` `#f0f6fc`, `--text-body` `#c9d1d9`, `--text-muted` `#8b949e`, `--text-faint` `#6e7681`): Four-step typographic contrast scale tuned for prolonged reading on dark and light surfaces.

### Named Rules
**The Semantic Tinted-Surface Rule.** Status badges, matrix priority cells, and alerts never use solid saturated fills; they pair a low-opacity tinted background (`0.12` alpha in dark, `0.08` in light) with a `1px` translucent border (`0.25`–`0.40` alpha) and a high-contrast semantic foreground text color.

**The Crimson Restraint Rule.** Bolivarian Crimson (`#f85149`) is reserved strictly for the `UBV` header wordmark, hard normative conflicts, and destructive actions—never for decorative highlights or neutral navigation.

## Typography

**Display & UI Font:** `Plus Jakarta Sans` (with fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
**Monospace / Code Font:** System `monospace` (for cédula codes `.email-code`, UC codes, and curriculum hour chips `.chip-hora`)

**Character:** Geometric, crisp, and authoritative at compact sizes, using strong weight contrast (`400`/`500` vs. `700`/`800`) and tight negative tracking on headings so dense administrative screens organize into instant visual tiers.

### Hierarchy
- **Display** (`800` weight, `2rem`, `1.0` line-height, `-0.03em` tracking, `font-feature-settings: 'tnum'`): Bento metric numbers (`.stat-number`).
- **Headline** (`800` weight, `1.5rem`, `1.25` line-height, `-0.025em` tracking): Primary view headings (`.page-title`).
- **Title** (`800` weight, `1.05rem`, `1.3` line-height): Section panel headers (`.panel-title`), modal titles (`.modal-clean-title`), and curriculum trajectory headers (`.bento-trayecto-title`).
- **Body** (`400`–`600` weight, `0.84rem` / `13.4px`, `1.5` line-height): Standard table cells (`.clean-table td`), form controls, and descriptive copy (`.page-subtitle` at `0.85rem`).
- **Label** (`700` weight, `0.74rem`, `0.04em`–`0.05em` tracking, uppercase): Table column headers (`.clean-table th`), Bento stat categories (`.stat-category`), and status/role pills (`0.68rem`–`0.72rem`).

### Named Rules
**The Civil Time & Tabular Numerals Rule.** All schedule blocks, availability matrices, and audit timestamps must render in 12-hour Venezuelan civil format (`hh:mm AM/PM`) with `font-variant-numeric: tabular-nums` (`tnum`) so columns align vertically to the pixel.

## Layout

SAHAD uses a centered, full-viewport flex column layout (`min-height: 100vh`) with a sticky `54px` single-row header (`.app-header`), a flexible main workspace (`.app-main`, `padding: 2rem 0 3.5rem`), and a compact institutional footer (`.app-footer`). Content sits inside `.app-container` (`max-width: 1240px`, horizontal padding `1.25rem` / `20px`).

Views follow a consistent vertical rhythm:
1. **Page Header (`.page-header`):** Breadcrumb trail (`.header-breadcrumbs`), `.page-title`, `.page-subtitle`, and right-aligned `.header-controls` separated by a `1px solid var(--border-subtle)` bottom border (`padding-bottom: 1.25rem`, `margin-bottom: 1.75rem`).
2. **Bento Summary / Context Strip:** 3-to-4 column responsive UIkit grids (`uk-grid-small`) of `.clean-stat-card` or compact context panels (`padding: 1.25rem 1.35rem`).
3. **Primary Workspace Panel (`.clean-panel` / `.data-table-wrapper`):** Server-paginated `SahadDataTable` or interactive weekly timetable matrix wrapped in `.uk-overflow-auto` for horizontal resilience on smaller screens.

## Elevation & Depth

Depth is achieved through structured tonal layering (`--canvas-bg` `#090c10` → `--surface-header` `#0d1117` → `--surface-card` `#161b22` → `--surface-card-hover` `#1f242c`) reinforced by crisp `1px solid var(--border-subtle)` hairlines and a minimal structural card shadow. Heavy drop shadows are reserved exclusively for floating modals and dropdown menus.

### Shadow Vocabulary
- **Resting Panel Shadow** (`--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.4)` + `--inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.03)`): Applied to `.clean-panel`, `.clean-stat-card`, `.search-input`, and `.table-filter-select`.
- **Modal & Dropdown Float** (`box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5)`): Applied to `.clean-modal` and `.clean-dropdown` overlays.
- **Focus Ring** (`box-shadow: 0 0 0 2px var(--accent-blue-bg)` with `border-color: var(--border-focus)`): Keyboard and input focus indicator across all form controls.

### Named Rules
**The Hairline-First Elevation Rule.** Never rely on blur shadows alone to separate surfaces; every card, panel, input, and badge is bounded by an explicit `1px` border token (`--border-subtle` at rest, `--border-medium` on hover).

## Shapes

The geometry is compact and architectural, scaling corner radii by element footprint:
- **Micro badges, status pills, hour chips, and table action buttons:** `4px` (`border-radius: 4px`).
- **Primary/secondary buttons, form inputs, toolbar selects, and Bento module tiles:** `6px` (`border-radius: 6px`).
- **Major containers (`.clean-panel`, `.clean-stat-card`, `.bento-trayecto-container`, `.clean-modal`, `.clean-dropdown`):** `8px` (`border-radius: 8px`).
- **Avatars and progress tracks:** Full pill/circle (`50%` or `999px`).
- **Callout & Audit Panels:** `3px`–`4px` semantic left accent bar (`border-left: 3px solid var(--accent-amber)` on `.disp-motivo-panel`; `4px solid var(--accent-red)` on `.clean-modal.border-danger`).

## Components

Components are **precise, explicit, and high-density**, engineered for rapid scanning and zero ambiguity.

### Buttons
- **Shape:** Gently rounded corners (`6px` for page actions, `4px` for compact table row actions).
- **Primary (`.btn-clean-primary`):** Cobalt Solver background (`#2f81f7`), white text (`#ffffff`), `1px solid rgba(255, 255, 255, 0.1)`, `padding: 0.5rem 1rem`, `0.84rem` (`600` weight), inline-flex with `0.4rem` icon-to-label gap.
- **Secondary (`.btn-clean-secondary`):** Slate Surface background (`--surface-card`), `1px solid var(--border-subtle)`, `--text-white`, transitions to `--surface-card-hover` on hover.
- **Ghost / Filter Reset (`.btn-clean-ghost`):** `34px` height, transparent background with `1px dashed var(--border-medium)`, `--text-muted`, turning solid `--border-focus` on hover.
- **Table Action (`.btn-table-action`):** Compact `4px 8px` padding, `--surface-muted` background, `1px solid var(--border-subtle)`, `0.74rem` (`600` weight), always pairing a semantic `uk-icon` with a visible `<span>` label inside `.table-actions-group` (`justify-content: flex-end`).

### Chips & Badges
- **Status Pills (`.status-pill`, `.badge-clean-*`):** `4px` radius, `2px 6px` or `3px 8px` padding, `0.68rem`–`0.72rem` (`700` weight), semantic tinted background and text.
- **Curriculum Hour Chips (`.chip-hora`):** Monospace `0.72rem` (`700` weight), `2px 7px` padding, `4px` radius, with distinct tinted borders for `.chip-ht` (blue), `.chip-hp` (emerald), `.chip-hc` (amber), and `.chip-total` (neutral).

### Cards / Containers
- **Corner Style:** `8px` radius on `.clean-panel` and `.clean-stat-card`; `6px` on interactive `.clean-tile`.
- **Background & Border:** `--surface-card` with `1px solid var(--border-subtle)`, shifting to `--border-medium` and `translateY(-2px)` on `.clean-tile:hover`.
- **Internal Padding:** `1.35rem` (`21.6px`) on panels; `1.25rem 1.35rem` on Bento stat cards.

### Inputs / Fields
- **Style:** `.form-input-clean`, `.search-input`, and `.table-filter-select` use `--surface-input`, `1px solid var(--border-subtle)`, `6px` radius, and `34px`–`38px` compact height.
- **Focus:** `border-color: var(--border-focus)` with `0 0 0 2px var(--accent-blue-bg)` glow ring.

### Navigation
- **Header (`.app-header`):** Sticky `54px` single-row container (`max-width: 1240px`), left UBV emblem + `SAHAD UBV` title + `Eje Kerepakupai Vena` subtitle, center horizontal `.header-nav` (`white-space: nowrap`, `.nav-link` with `6px` radius and `.is-active` pill highlight), right utility buttons (`.icon-btn` `32x32px`), `.user-profile` pill (`20px` radius), and `.btn-logout-ghost`.

### Signature Components: `SahadDataTable` & Weekly Timetable / Availability Matrix
- **`SahadDataTable` (`.data-table-wrapper`):** Combines `.table-toolbar` (debounced HTMX search `.search-input`, server filter selects, and page-size selector), `.clean-table` (sortable uppercase headers, hover rows, right-justified `.table-actions-cell`), and `.table-footer` (record range counter + `.clean-pagination-list`).
- **Availability & Schedule Matrix (`.matrix-table`, `.disp-cell`):** Interactive weekly grid with 12-hour `AM/PM` block headers (`.disp-bloque-celda`) and clickable/draggable cells cycling through `NO` (`.is-nodisp`), `P1` (`.prio-1` green), `P2` (`.prio-2` cobalt), and `P3` (`.prio-3` amber), backed by a live audit trail (`#historial-disponibilidad`).

## Do's and Don'ts

### Do:
- **Do** define all component styles in `src/public/css/style.css` (and its `src/public/css/modules/*.css` imports) using CSS custom properties from `variables.css` so both `dark` and `light` themes render with full fidelity.
- **Do** include both a semantic icon (`<span uk-icon="..."></span>`) and a visible text label (`<span>Texto</span>`) inside every table action button (`.btn-table-action`), grouped inside `.table-actions-cell > .table-actions-group` aligned to the right.
- **Do** format all hours and schedule blocks in 12-hour Venezuelan civil format (`AM/PM`) and execute all table pagination, sorting, and filtering on the server via `SahadDataTable` + HTMX.
- **Do** style dropdown menus formally with `.clean-dropdown` and `.dropdown-action-btn` using semantic color classes (`.text-danger`, `.text-success`).

### Don't:
- **Don't** render icon-only action buttons, empty pill buttons, or unstyled native browser controls in any table or form.
- **Don't** hardcode dark-only hex colors or inline style attributes in EJS templates that break `data-theme="light"` or bypass the modular stylesheet.
- **Don't** load full database tables into the client DOM without server-side pagination (`skip`/`take`), or use 24-hour military time in user-facing schedule views.

