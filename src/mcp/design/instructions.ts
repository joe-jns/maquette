/**
 * Instructions du serveur MCP (champ `instructions`), communes au chat de l'app et à Claude Code hors de
 * l'app : neutres. La méthode (Pen ou taste-skill) est choisie par la consigne du chat. Code pur.
 */
export const MCP_INSTRUCTIONS = `Maquette is a Figma-like mockup editor; these tools read and change the open document. Each appliquer call is one undo; the user watches live.
Small precise requests (recolour, move, rename, fix a text): just do them.
For a new page, section or screen:
1. lire_document and selection: the subject, the one action, the content of each section.
2. A style. Keep the document's named colours and text styles if it has them. With references (selected images, or inspiration the user points to): look at each (capture, or capture({ids})), take typefaces (mapped to Google fonts), palette, radii, spacing and layout from them, apply them in one appliquer (style.color.set + style.text.set); never move or delete the references. Otherwise decide the look from the user's request itself (typefaces, palette, radii) and apply it in one appliquer; never use Pen archetypes (style) unless the user names one. direction({secteur, brief, sections}) (taste-skill directions, choix then appliquer:true) only when taste-skill is asked for.
3. When starting from an existing design and the user says to keep its style ("garde le style"): keep its palette, typefaces and weights; rework the layout freely, never drop its distinctive elements for a rule.
4. guide("<type>") (landing-page, web-app, mobile-app, slides, table, design-system); guide("methode") for the model.
5. Full content, no invented proof. Build one appliquer per section, in reading order, with {"style":id} colours and textStyle ids.
6. After each section: capture it and check nothing is collapsed, clipped, low-contrast or misaligned; fix with update (never delete and rebuild). verifier_gout runs the taste-skill rules on a frame when wanted.`
