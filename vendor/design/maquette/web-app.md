# Web app

Pen's web-app guide (text kept; "brand.md" replaced by the chosen style or direction), with Maquette
notes at the end. taste-skill's house rules target public pages; for app screens they are relaxed
(real tables, fields, borders and menus keep their conventions).

You are designing a responsive web application interface. These are universal product design
principles that apply to ANY use case: CRM, analytics, editor, marketplace, fintech, admin panel, AI
tool, or unknown future systems. Visual identity, typography, color and stylistic expression come from
the style archetype (`style`) or the document's named colours and text styles. Generate functional
product UI only, not marketing pages.

## 1. Purpose First
Every screen must have a clearly defined primary purpose.
- A screen should answer one dominant user question.
- A screen should support one primary action.
- If multiple goals compete, separate them into distinct surfaces.
No multi-purpose cluttered screens.

## 2. Dominant Region Rule
Every screen must contain one dominant visual region.
- Visual weight must reflect importance.
- Secondary regions must be subordinate.
- Avoid equal-weight layouts. Avoid competing focal points.
Hierarchy is mandatory.

## 3. Understandability
The interface must explain itself.
- Labels must be clear. Actions must be recognizable.
- Icons must not replace essential text.
- System state must be visible.
If a user must guess what something does, redesign it.

## 4. Progressive Disclosure
Reveal complexity gradually.
- Show essential information first.
- Advanced controls must be contextual.
- Do not overwhelm with full capability at once.
- Detail views should open on demand.
Complexity is allowed. Confusion is not.

## 5. Recognition Over Recall
- Surface relevant actions when needed.
- Do not require users to remember previous states.
- Keep navigation predictable. Use consistent placement of controls.

## 6. System Status Visibility
Every data-driven surface must support: loading, empty, error, success confirmation, and permission
or restriction state (when applicable). No silent failure. No blank ambiguity.

## 7. Action Hierarchy
- One primary action per screen or section.
- Secondary actions visually reduced.
- Destructive actions clearly distinct.
- Rare actions placed in overflow.
Do not give equal emphasis to all actions. Honest emphasis only.

## 8. Structural Consistency
- Similar problems → similar solutions.
- Navigation logic must remain stable.
- Layout rhythm must feel system-driven.
- Spacing must follow a consistent scale.

## 9. Density Intentionality
Compact (high data), medium (balanced default), airy (low-complexity workflows). Do not mix density
modes arbitrarily within one screen.

## 10. Spatial Logic
- One dominant axis per screen.
- Prefer two structural zones before three.
- Avoid unnecessary nested scroll containers.
- Use whitespace for separation. Avoid decorative dividers unless functionally needed.
Structure over ornament.

## 11. Feedback & Response
Immediate acknowledgment, clear validation messaging, reversible actions where possible, confirm
destructive operations.

## 12. Responsiveness Philosophy
Mobile: single dominant column; secondary panels become sheets or stacked sections; no horizontal
scrolling unless essential. Tablet: transitional. Desktop: multi-zone allowed, higher density permitted.

## 13. Entity Integrity
Whenever representing an entity (user, record, document, asset): display its name prominently,
surface its status clearly, show key metadata, make actions obvious.

## 14. Constraint Over Decoration
If an element does not support navigation, understanding, decision-making or action-taking, it should
not exist. As little design as possible.

## 15. Scalability
More data must not break structure. More features must not collapse hierarchy.

## 16. Adaptation Logic
Infer product type from the prompt, then determine: dominant region, primary action, appropriate
density, level of progressive disclosure. Do not assume dashboards, tables, sidebars or canvases unless
required by purpose. Structure must emerge from utility.

## In Maquette

- A screen is a top-level frame 1440×900 (or `height:{mode:"hug"}` when the content is long), `clip:true`.
- Sidebar + content: screen `layout:{mode:"auto",direction:"row"}`; sidebar 240–280 wide `height:{mode:"fill"}`; main `width:{mode:"fill"}`, column layout, padding 32, gap 24. Header + content: a 64 px row bar (`justify:"space-between"`, `align:"center"`) above the content column.
- Two columns: main `fill` + side 360 px. Card grid: a row of `fill` children with gap 16–24.
- See `guide('design-system')` for spacing, button hierarchy, tokens; `guide('table')` for tables.
