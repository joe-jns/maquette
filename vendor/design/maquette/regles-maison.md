# House rules (taste-skill), for Maquette mockups

Adapted from taste-skill (`SKILL.md`, MIT licence, Leonxlnx) to static mockups built with `appliquer`.
They hold on every public web page (landing, site, portfolio). App screens and dashboards follow the
Pen guides (`web-app`, `mobile-app`, `table`) and keep only the laws that make sense there.
`verifier_gout` measures most of them on the real render.

A page built by a model looks like the average of every page it has seen: centred headline over three
lines, a little label above it, a row of icon cards, a soft gradient, thin rules, a monospace caption.
Nothing is wrong and nothing was decided. Replace those defaults with decisions.

Taking ornaments away is only half the job. A page that lost its labels, rules and cards and gained
nothing reads as thin. The other half is substance: type set larger, whole fields of colour, real
pictures of this subject's world, every section carrying its full content.

## The run (new page)

1. **Inventory**: eight to twelve things that belong to this client and to no competitor — its name and
   what it means, its street and what that place looks like, the numbers in the brief (seats, rooms,
   price, year), the constraint it lives with, its materials and colours, its rituals and hours, the
   printed things of its world (ticket, label, menu, timetable).
2. **Argument**: one line per section, a claim and its proof. A section with no claim is deleted. This
   avoids the stock sequence hero / logos / three features / testimonial / pricing / call to action.
3. **Direction**: `direction` (taste-skill) deals three; choose the one that can carry an inventory item,
   not the most familiar. Adopt the sheet; don't blend it with the layout you'd have made anyway.
4. **Idea**: "On this page, [something that belongs to the subject] becomes [the device the direction calls
   for]." Competitor test: put the nearest competitor in the sentence; if it still works, it's a category
   idea — find another.
5. **Words before boxes**: write the whole page's copy first. Every headline fits in two lines (about 32
   characters is safe at a confident size). One supporting sentence, one primary action named for what it
   does. Write the full content (the whole menu with prices, each room, every speaker). Sample details are
   fine where the brief has gaps; proof is never invented (no fake customers, quotes, logos, statistics).
6. **Build**: tokens first (named colours, text styles), then the hero exactly as the blueprint says, then
   each section from its blueprint. Neighbouring sections never share a layout. Carry the idea into every
   section, pricing and footer included.
7. **Look**: `capture` + `verifier_gout` after each section; at the end, critique the captures
   (`guide('taste-critique')`), fix the top three problems, look again.

## Rules

| Rule | Instead |
| --- | --- |
| Headlines: two lines or fewer, at every width. | Cut words, then widen the measure, size last. |
| Statements (intro sentence, quote set large) stay ≤ 36 px desktop, ~25 words, three lines. | Larger is a headline: the two-line rule applies. |
| No eyebrows: no small label or pill above a heading, no "New ·" chip. | Put it in the heading or the first sentence, or drop it. |
| No monospace outside real code. | The text face; tabular figures where numbers align. |
| No index numbering (01 / 02 / 03, "Step 2"). | Order by position, size or words. |
| No thin rules: no hairline dividers, 1 px outlined boxes, grid lines. | Space, a step in background tone, a change of scale, a filled shape. |
| No gradients (backgrounds, buttons, text). | Flat colour or a real photograph; a neutral scrim under text on a photo is the one exception. |
| No shadows on things at rest, no glows. | A tone step between surfaces. Shadows only on what truly floats (menu, dialog). |
| No assistant palette: no cream ground with terracotta/rust; no violet or indigo. | The dealt palette. |
| No tiny uppercase letter-spaced labels. | Sentence case at a readable size. |
| No icon-topped feature cards, no rows of identical cards. | The dealt section blueprint. |
| No glass, no floating pill navigation. | A plain bar: wordmark, a few links, one action. |
| No emoji, gradient blobs, decorative shapes, fake dashboards of grey bars. | A real picture, a real interface fragment, or nothing. |
| No styled accent word in a headline (italic, serif, coloured). | One face, one colour; the words carry the emphasis. |
| Two typefaces at most, usually one. | The dealt type system. |

Real tables and form fields may have lines; a real interface fragment keeps its own borders.
Removing ornament leaves space: never fill it with another ornament. Fill it with scale, the full
content, a picture made for this subject, or a field of flat colour. Empty on purpose once per page at most.

## Laws

**Type** — Two or three sizes do the visible work: one very large, one small. Headline-to-body ratio
around 4 or more (hero headline 64–120 px on a 1440 frame). Display: tracking −0.02 to −0.05 em,
leading 0.85–1.05. Text 16–20 px, leading 1.45–1.6, 45–75 characters per line (a 560–680 px column).
Five sizes per page at most. Left-aligned by default; centre one moment at most.

**Space** — One grid, one pair of side margins used everywhere; large things run to the edges. Text
blocks share two or three left edges on the whole page. The gap between sections (120–220 px on desktop)
is clearly larger than any gap inside one. Each section has a different composition from its neighbours.

**Colour** — One ground, one ink, one accent. The accent is on the action and perhaps one other thing.
Running text in the full ink (grey is for secondary notes). Surfaces separated by a small step in tone.
A section may change the whole field colour.

**Imagery** — One dominant image beats six small ones; hero media covers at least half the first screen
on most strong sites. Same crop ratios and treatment; square corners unless the direction says otherwise.
At least four real pictures on a page (photographs, archival images, maps, engravings, interface crops).
Nothing lies on top of a headline.

**Components** — Buttons flat, one fill, square or fully round, decided once (the 9–16 px "soft" radius
is the weak default). Navigation: wordmark, three to five plain links, one action. The footer is a
designed close (the name returns at full width), not a sitemap.

**Fullness** — Look at each desktop screen (1440×900) as a poster: one dominant thing and the content it
carries. A mostly empty screen is an underbuilt section, not a rest.
