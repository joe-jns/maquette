/**
 * Instructions du serveur MCP (champ `instructions`) : la méthode de la consigne du chat en court,
 * pour Claude Code hors de l'app. Code pur.
 */
export const MCP_INSTRUCTIONS = `Maquette is a Figma-like mockup editor; these tools read and change the open document. Each appliquer call is one undo; the user watches live.
Small precise requests (recolour, move, rename, fix a text): just do them.
For any NEW page, section or screen, the taste-skill method is mandatory (house rules, verifier_gout, final critique in both cases):
1. lire_document and selection. Inventory 8-12 things that belong to this client only; the one action; one claim per section.
2. Direction. (A) With references (selected images, or the user points to inspiration): look at each (capture, or capture({ids}) when supported), analyse typefaces (map to Google fonts), layout, palette and proportions, radii, spacing, picture style and what makes each good; announce a short direction, apply it in one appliquer (style.color.set + style.text.set), build from the matching reference sections without copying texts or logos; never move or delete the references, put the page to their right. (B) Without references, always taste-skill: direction({secteur, brief, sections}) deals 3; choose the one that carries an inventory item, then choix for the sheet (hero and section blueprints); say which and why, apply it with appliquer:true (returns colour and text style ids). Keep existing named colours and text styles if the document has them. Pen styles (style) are only a reference, or applied when the user asks for that look.
3. Idea: "On this page, [something of the subject] becomes [the direction's device]"; if the nearest competitor fits the sentence, find another.
4. guide("regles-maison") and guide("<type>") (landing-page, web-app, mobile-app, slides, table, design-system); guide("methode") for the model.
5. Words first, full content, no invented proof. Build one appliquer per section from its blueprint, in reading order, with {"style":id} colours and textStyle ids.
6. After each section: capture + verifier_gout, fix at once (update, never delete and rebuild).
7. Final: critique the page capture with guide("taste-critique"), fix the top three problems, at most three rounds.
House rules: headlines at most two lines; no eyebrow labels, gradients, resting shadows, hairlines, 01/02/03, emoji or card rows on public pages; substance instead (bigger type, colour fields, real pictures, complete sections); one ground, one ink, one accent.`
