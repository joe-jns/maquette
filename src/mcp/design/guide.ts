/**
 * Sommaire des guides de design (vendor/design) lus à la demande par l'outil `guide`.
 * Seuls les sujets listés ici sont lisibles. Code pur.
 */

export interface GuideTopic { id: string; file: string; line: string }

const BETTER: [string, string, string[]][] = [
  ['better-typography', 'typographie : choix et accords de polices, échelle, interlignes, approche, coupures', ['choosing-fonts', 'spacing-and-sizing', 'wrapping-and-punctuation', 'details-and-accessibility', 'variable-fonts-and-opentype', 'css-cheat-sheet']],
  ['better-colors', 'couleur : palettes, usage, contrastes, OKLCH', ['color-usage', 'palette-generation', 'accessibility-contrast', 'color-conversion', 'gamut-and-tailwind']],
  ['better-layout', 'mise en page : regroupement, alignement, espacements, adaptation', ['grouping-and-alignment', 'spacing-and-adaptivity']],
  ['better-ui', 'finition d’interface : surfaces, ombres, bordures, icônes', ['surfaces', 'icons', 'animations', 'performance']],
  ['better-interface', 'revue d’interface : grille de sévérité et verdict', []],
  ['better-writing', 'textes d’interface : boutons, erreurs, états vides', []],
  ['better-accessibility', 'accessibilité : cibles tactiles, formulaires, focus', ['hit-areas', 'forms', 'focus-and-keyboard', 'semantics-and-aria', 'screen-readers', 'motion-and-zoom']],
]

const TASTE: [string, string][] = [
  ['type', 'typographie : échelles, approche, mesure, accords'],
  ['colour', 'couleur : rôles, proportions, paliers de ton, pages sombres, contraste'],
  ['layout', 'grille, marges, rythme, variété des sections, navigation, pied de page'],
  ['copy', 'argumentaire et textes : titres en deux lignes, phrases, appels à l’action'],
  ['critique', 'relecture critique des captures : passes, note, quoi corriger d’abord'],
  ['tells', 'registre des signes d’une page générée et leur remplacement'],
  ['imagery', 'images : choisir, trouver, créditer, cadrer, traiter ; sans image'],
]

export const GUIDES: GuideTopic[] = [
  { id: 'methode', file: 'maquette/methode.md', line: 'méthode complète : outils, modèle (cadres auto/libre, hug/fill, textSizing, couleurs nommées), appliquer, vérification' },
  { id: 'regles-maison', file: 'maquette/regles-maison.md', line: 'règles maison taste-skill des pages publiques : démarche, interdits, lois (typo, espace, couleur, images)' },
  { id: 'qualite', file: 'maquette/qualite.md', line: 'qualité commune aux styles de Pen : art de la réduction, hiérarchie, respiration, couleur, hero' },
  { id: 'landing-page', file: 'maquette/landing-page.md', line: 'landing page, site vitrine' },
  { id: 'web-app', file: 'maquette/web-app.md', line: 'écrans d’application web, tableaux de bord' },
  { id: 'mobile-app', file: 'maquette/mobile-app.md', line: 'écrans d’application mobile (barre d’état, contenu, barre d’onglets)' },
  { id: 'design-system', file: 'maquette/design-system.md', line: 'couleurs et styles nommés, gabarits d’écran, espacements, hiérarchie des boutons' },
  { id: 'table', file: 'maquette/table.md', line: 'tableaux : tableau → ligne → cellule' },
  { id: 'slides', file: 'maquette/slides.md', line: 'diapositives 1920×1080 : règles et 20 gabarits' },
  ...TASTE.map(([id, line]): GuideTopic => ({ id: `taste-${id}`, file: `taste/${id}.md`, line: `taste-skill, ${line}` })),
  ...BETTER.flatMap(([id, line, annexes]): GuideTopic[] => [
    { id, file: `better/${id}/SKILL.md`, line },
    ...annexes.map((a): GuideTopic => ({ id: `${id}/${a}`, file: `better/${id}/${a}.md`, line: '' })),
  ]),
]

/** Sujets montrés au sommaire (les annexes « skill/fichier » sont citées à la fin de leur skill). */
export const MAIN_TOPICS = GUIDES.filter((g) => !g.id.includes('/'))

export const TOPIC_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/

export function findGuide(topic: string): GuideTopic | undefined {
  const id = topic.trim().toLowerCase()
  return TOPIC_PATTERN.test(id) ? GUIDES.find((g) => g.id === id) : undefined
}

export function summary(): string {
  return [
    'Guides — guide("<sujet>") :',
    ...MAIN_TOPICS.map((g) => `- ${g.id} : ${g.line}`),
    'taste-* et better-* sont les textes d’origine, écrits pour du code web : transposer en propriétés Maquette (guide("methode")).',
  ].join('\n')
}

/** Annexes d'un skill better-*, citées à la fin de son texte. */
export function annexesOf(topic: GuideTopic): string[] {
  return GUIDES.filter((g) => g.id.startsWith(`${topic.id}/`)).map((g) => g.id)
}
