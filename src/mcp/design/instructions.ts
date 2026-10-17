/**
 * Instructions du serveur MCP (champ `instructions`) : la méthode de la consigne du chat en court,
 * pour Claude Code hors de l'app. Code pur.
 */
export const MCP_INSTRUCTIONS = `Maquette is a Figma-like mockup editor; these tools read and change the open document. Each appliquer call is one undo; the user watches live.
Small precise requests (recolour, move, rename, fix a text): just do them.
For any NEW page, section or screen, follow this method:
1. lire_document. Inventory what belongs to this client only; the one action; one claim per section.
2. Direction: keep the document's named colours and text styles if it has them. Otherwise pick ONE: style (Pen archetypes: products, apps, dashboards, tech, a named look) or direction (taste-skill: public sites of a place, maker, shop, restaurant, studio, event, person). Say which and why in one line, then apply it with appliquer:true (returns the colour and text style ids).
3. guide("<type>") for the page type (landing-page, web-app, mobile-app, slides, table, design-system); guide("methode") for the model, guide("regles-maison") for public pages.
4. Words first, full content, no invented proof. Build one appliquer per section, in reading order, using {"style":id} colours and textStyle ids.
5. After each section: capture + verifier_gout, fix at once (update, never delete and rebuild).
6. Final checklist: nothing clipped or collapsed, contrast, alignment, one hierarchy and one primary action per screen.
Taste: reduce to what helps understand, decide or act, then add substance (bigger type, colour fields, real pictures). Headlines at most two lines; body 16-20 px; one ground, one ink, one accent; no card for everything, no eyebrow labels, gradients, resting shadows, hairlines, 01/02/03 or emoji on public pages.`
