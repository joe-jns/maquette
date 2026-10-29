# Design system composition

Adapted from Pen's design-system guide. Maquette has no components or slots: a design system here is
the document's named colours and text styles, plus elements built identically by construction. The
layout patterns, spacing reference, button hierarchy and principles are Pen's.

## Tokens = named colours and text styles

Create them first (`style.color.set`, `style.text.set`, or `style`/`direction` with `appliquer:true`),
then reference them everywhere: `{"style":"<id>"}` for colours, `textStyle:"<id>"` for texts (ids in
`lire_document` → `ids_styles`). Hard-coded values only for one-offs.

| Role | Use |
| --- | --- |
| Fond / background | Page background |
| Encre / foreground | Primary text |
| Discret / muted | Secondary text, placeholders |
| Surface | Card and panel backgrounds |
| Bordure / border | Borders, dividers |
| Accent / primary | Primary actions, brand |
| Succès, Alerte, Erreur, Info | Status colours, each with a readable text colour on it |

Typography: one face for headings, labels and navigation; one for body text, descriptions, inputs.
Radius: none for tables and sharp containers, medium for cards and modals, full (999) for pills.

## Common patterns (structure)

- **Sidebar**: header (logo), navigation items (active one highlighted), footer (profile, settings).
- **Card**: header (title, description), content, actions (right-aligned).
- **Tabs**: a row of items, the first active.
- **Dropdown**: optional search, dividers, section titles, items.
- **Table**: header (search, filters, actions) → rows → footer (count, pagination). See `guide('table')`.
- **Pagination**: previous, page numbers (active, default, ellipsis), next.

Build one instance, check it with `capture`, then build the others with exactly the same properties
in the same batch.

## Screen layout patterns

- **A — Sidebar + content (dashboard)**: screen row 1440×900; sidebar 280 `height:fill`; main `width:fill`, column, padding 32, gap 24.
- **B — Header + content**: screen column 1200; header bar 64 px row, padding [0,24,0,24], `align:center`, `justify:space-between`, bottom stroke; content column padding 32, gap 24.
- **C — Two columns**: main `fill` + side 360, gap 24.
- **D — Card grid**: a row of `fill` cards, gap 16.
- **Page header**: breadcrumbs left, actions right (`justify:space-between`).
- **Form**: column gap 16; two fields in a row (gap 16), then full-width fields; submit right-aligned.
- **Metric cards**: a row of `fill` cards, each a label (14, muted) over a value (32, semi-bold).

## Icons

If the `icon` element type is present in `appliquer`, use it for iconography (Lucide names: `home`,
`settings`, `user`, `search`, `plus`, `x`, `pencil`, `trash-2`, `check`, `arrow-right`, `chevron-down`,
`menu`, `layout-dashboard`, `folder`, `file`, `calendar`, `mail`, `bell`), or one other set (`phosphor`,
`feather`, `material-rounded`) for the whole design. Same set, size and stroke or weight everywhere.
Never draw icons from shapes.

## Spacing reference

| Context | Gap | Padding |
| --- | --- | --- |
| Screen sections | 24–32 | — |
| Card grid | 16–24 | — |
| Form fields (vertical) | 16 | — |
| Form row (horizontal) | 16 | — |
| Button groups | 12 | — |
| Inside cards | — | 24 |
| Inside buttons | — | [10,16,10,16] |
| Inside inputs | — | [8,16,8,16] |
| Page content area | — | 32 |
| Sidebar items | 0 | [12,16,12,16] |

## Button hierarchy

One primary action per section. Priority: 1 primary (main action: save, submit, create) · 2 secondary
(alternative) · 3 outline (tertiary, cancel, back) · 4 ghost (inline, navigation) · 5 destructive
(delete, remove). Cards and modals: actions right-aligned (`justify:end`). Forms: submit right-aligned.
Toolbars: primary left, secondary right. Destructive + cancel: cancel left, destructive right.

## Principles

- **Visual hierarchy**: one clear focal point per section; size, weight and colour establish
  importance; primary actions visually dominant.
- **Alignment & grid**: align to an implicit grid; consistent edges inside containers; no orphaned or
  floating elements.
- **Spacing consistency**: reuse the established gap/padding values; consistent vertical rhythm.
- **Colour usage**: named colours, not raw hex; sufficient contrast; status colours only for status.
- **Content density**: breathing room; one primary idea per card; 4–7 columns per table.
- **Grounding**: read what exists (`lire_document`, `chercher`) before building; `capture` after major
  operations; reuse existing elements (same structure, same styles) before inventing new ones.
