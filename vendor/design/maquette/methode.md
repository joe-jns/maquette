# Designing in Maquette — full method

Adapted from Pen's `pen-dev` skill (SKILL.md, execute.md, pen-schema.md) to Maquette's model and tools.
The design rules are kept; Pen's format and functions are replaced by Maquette's.

## Tools

- `lire_document` — pages, top-level elements, named colours and text styles (with their ids in `ids_styles`). Start here.
- `lire_elements` / `chercher` — read details, find by name, type or text.
- `appliquer` — one atomic batch of operations = one undo for the user. One batch per section.
- `capture` — JPEG of an element. Use after each finished section, on the section frame (not the whole page).
- `verifier_gout` — taste-skill rules measured on the real render of a frame, when the chat's method asks for it.
- `style` — Pen's style archetypes (identity, type, palette, radii, elevation, imagery); `appliquer:true` creates the named colours and text styles.
- `direction` — taste-skill: deal 3 directions for a brief, then the full sheet of one; `appliquer:true` creates colours and text styles.
- `guide` — this text and the others (page types, house rules, typography, colour, layout, critique).
- `images` (if present) — find and place a real picture. `icon` elements in `appliquer` (if present).

## General instructions

- Do only what is asked. A technical request (move, rename, recolour, delete) gets no design ceremony.
- The user watches the canvas live: work in the order a designer would, show something early, one `appliquer` per section (hero, then the next…), never a whole page in one batch.
- The document can change while you work: if an element is missing or different, read it again (`lire_elements`), don't recreate it and don't undo the user's changes.
- After reviewing, never delete a section to redo it: update the existing elements.
- Use the canvas to think: no need to pre-plan every detail; iterate on the document.
- Each page/screen is a top-level frame of a page (`x`,`y` set, `clip:true`), placed to the right of the existing ones (read their `x`+`l` with `lire_document`; leave ~200 px). Never put loose texts, buttons or shapes directly in a page.
- Name every element (`name`) in plain words: "Hero", "Bouton principal", "Carte tarif". Names are how you and the user find things.
- Repeated UI (cards, rows, nav items, buttons): build one, check it, make it a component (`update {component:true}`), then place instances of it (see **Components**). Change the main to change them all.
- Don't think in CSS or HTML. Maquette has its own model: if a property is not listed below, it does not exist — find another way.

## The model

Elements: `frame` (the only container), `text`, `shape` (`rectangle`|`ellipse`), `image`, `icon`, `vector` (SVG path). All sizes in px.

**Sizes** — `width`/`height` are a number, `{"mode":"hug"}` (fit the content: auto-layout frames and texts only) or `{"mode":"fill"}` (share the parent's space: in-flow children of an auto-layout frame only). A `hug` frame cannot contain a `fill` child on the same axis (circular). Prefer `hug`/`fill` over repeating pixel values; set explicit sizes on shapes and images.

**Frames** — defaults are 400×300, a white fill and free layout: always set `width`, `height` and `fills` (`[]` = transparent wrapper). Auto layout:
`layout:{mode:"auto", direction:"row"|"column", gap, padding:[top,right,bottom,left], justify:"start"|"center"|"end"|"space-between"|"space-around"|"space-evenly", align:"start"|"center"|"end"|"stretch"|"baseline", wrap}`.
- Always prefer auto layout; free layout (`{mode:"free"}`) only for deliberate overlaps.
- In-flow children have no `x`/`y` (they are ignored). To overlay something inside an auto frame: `position:"absolute"` with `x`,`y`.
- Padding applies to all children; to offset one child, wrap it in a frame with its own padding. No margins: use `gap` and padding, never spacer elements.
- Single axis per frame; for grids use rows of `fill` children, or `wrap:true` with `rowGap`.
- Centre children with `justify:"center"` + `align:"center"` on the parent.
- `minWidth`/`maxWidth`/`minHeight`/`maxHeight` work on auto frames and their direct children.
- Other properties: `radius` (number or [tl,tr,br,bl]), `stroke:{color,width,align:"inside"|"outside"|"center"}`, `shadows:[{x,y,blur,spread,color,inset}]`, `opacity`, `clip`, `blur` (px, blurs the layer), `backgroundBlur` (px, frosted glass: blurs what is behind; give the frame a translucent fill).

**Texts** — `content`, `fontFamily` (every Google font loads), `fontWeight`, `fontStyle`, `fontSize`, `lineHeight` (px, not a ratio), `letterSpacing` (px), `textAlign`, `color`, `textStyle` (id of a text style).
- `textSizing:"auto"` — one line, width and height `hug`: labels, buttons, tags.
- `textSizing:"auto-height"` — wraps: `width` a number or `fill`, height `hug`: headings, paragraphs. Set `width:{mode:"fill"}` inside an auto frame that has a real width.
- Never guess text dimensions; let wrapping and layout size them. A `fill` text in a `hug` parent collapses: give the parent a width (number or `fill`).
- `textAlign` changes the lines inside the box, not the box's position: align the box with the parent's layout.

**Colours** — `"#RRGGBB"` or `"#RRGGBBAA"`, or a named colour `{"style":"<id>"}`. Text style: `textStyle:"<id>"` (it drives family, weight, size, line height and spacing). The ids are in `lire_document` → `ids_styles`, and in the answer of `style`/`direction` with `appliquer:true`. Use the named colours and text styles everywhere; hard-coded hex only for one-off values.

**Fills** — `fills` is a stack (last on top) on frames, shapes and vectors: a colour, a gradient `{type:"linear"|"conic", angle, stops:[{color, position:0..1}]}` or `{type:"radial", stops}` (CSS `linear-gradient(…)`/`conic-gradient(from 90deg, …)` strings are read too), or, on frames and shapes only, an image `{type:"image", src, fit:"cover"|"contain"|"fill"}` (a photo behind a frame's content, under a translucent colour fill for legible text).

**Icons** — `type:"icon"`, `icon` (name in its set, from `icones`), `set`: `lucide` (default, stroke), `phosphor` (filled shapes; `weight`: `thin`|`light`|`regular`|`bold`|`fill`|`duotone`), `feather` (stroke), `material-rounded` (Material Symbols Rounded, snake_case names like `content_cut`; `weight` 100-700, `filled:true`). `color`; `strokeWidth` for stroke sets only. One set per design.

**Vectors** — `type:"vector"`, `path` (SVG `d` attribute), `viewBox:[x,y,w,h]` (the part of the path stretched to the box; omitted = the path's bounds, and the size defaults to it), `fillRule:"nonzero"|"evenodd"`, `fills` (colours, gradients), `stroke` (keeps its px width at any size), `shadows`, `blur`. For logos, blobs, dividers and custom marks; prefer `icon` for UI icons.

**Components** — any frame becomes a main component with `update {id, set:{component:true}}`. An instance is `create {parent, node:{type:"frame", instanceOf:"<main id>", x, y, descendants?:{"<id of a layer in the main>":{content:"…"}}}}`: a real copy whose layers carry `source` (the main's layer) and follow the main. Position, size and name of the instance stay its own. `update` on a layer of an instance is an override (kept when the main changes; `visible:false` hides it). Inside an instance you cannot create, delete or move layers: edit the main, or detach. `update {overrides:null}` resets an instance (or one layer), `update {instanceOf:null}` detaches it into ordinary layers. Deleting a main detaches its instances. An instance of a component cannot go inside that component.

**Images** — `type:"image"`, `src` (path or URL), `fit:"cover"|"contain"|"fill"`, explicit `width`/`height` (or `fill`), `radius`. Placing a real picture: `images` tool if present; otherwise an image element with an honest placeholder and say so.

## appliquer

`create {parent, index?, node:{type,…}}` — `parent` is a frame id or a page id; nested `children:[…]` are accepted and created in order. `update {id, set}` (`null` removes an optional property). `move {id, parent, index?, x?, y?}`. `delete {id}`. `page.create {name}`, `page.update`, `page.delete`, `page.move`. `style.color.set {id?, name, value}`, `style.text.set {id?, name, fontFamily, fontWeight, fontStyle, fontSize, lineHeight, letterSpacing}`, `style.delete {id}`.

Temporary ids `"$name"` link elements created in the same batch (`parent:"$hero"`) and come back as real ids in `ids`. Keep them for the next batches. Read `corrections` and `adapte` in the answer: they say what Maquette fixed for you; don't repeat the mistake.

Example — a hero section in one batch:

```json
{"libelle":"hero","operations":[
 {"op":"create","parent":"<page frame id>","node":{"id":"$hero","type":"frame","name":"Hero","width":{"mode":"fill"},"height":{"mode":"hug"},"fills":[{"style":"<Fond>"}],
  "layout":{"mode":"auto","direction":"column","gap":32,"padding":[120,96,120,96]},"children":[
   {"type":"text","name":"Titre","content":"Des lieux qui respirent","textStyle":"<Titre 1>","color":{"style":"<Encre>"},"width":{"mode":"fill"},"textSizing":"auto-height"},
   {"type":"text","name":"Intro","content":"Une phrase qui dit ce que c'est et pour qui.","textStyle":"<Texte large>","color":{"style":"<Encre>"},"width":560,"textSizing":"auto-height"},
   {"type":"frame","name":"Bouton principal","width":{"mode":"hug"},"height":{"mode":"hug"},"fills":[{"style":"<Accent>"}],"radius":0,
    "layout":{"mode":"auto","direction":"row","padding":[16,28,16,28]},"children":[
     {"type":"text","name":"Libellé","content":"Réserver une table","textStyle":"<Texte>","color":{"style":"<Sur accent>"}}]}]}}]}
```

## Verify each section right away

After each section: `capture` of the section frame (and `verifier_gout` when the method asks for it). Fix with `update` (never delete and redo). Checklist:
- Layout not collapsed or broken; nothing at 0 width.
- No content clipped or cut; frames grow with their content (`hug`), or are resized.
- Text contrast on its real background; no grey running text.
- Elements aligned on shared edges; spacing from one scale; groups tight, sections far apart.
- The intent matches the render (what you meant is what is drawn).

## Graphs and tables

- Prefer bar charts built from layout: a row of `fill`-width columns, each a column frame with a bar (shape, height = value) and its label. Don't position labels by hand over a chart; line charts are hard, avoid them.
- Tables: Table (column frame) → Row (row frame, `width:fill`) → Cell (frame, fixed or `fill` width) → content. Never put texts straight in a row. See `guide('table')`.
