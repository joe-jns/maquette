/**
 * Outil `direction` : directions de taste-skill (draw.mjs) mises en texte compact pour Claude.
 * Code pur.
 */
import type { DirectionOption, DirectionSheet } from '../../taste/direction'

/** Ce que draw.mjs écrit dans direction.json et que la fiche reprend (le reste est ignoré). */
export interface FullSheet extends DirectionSheet {
  seed?: number
  direction?: { id?: string; name: string; idea: string; composition?: string; typography?: string; colour?: string; imagery?: string; pitfalls?: string; richness?: string }
  hero?: { name: string; blueprint: string; headline?: string }
  type: DirectionSheet['type'] & { name?: string; note?: string }
  palette: DirectionSheet['palette'] & { name?: string; note?: string }
  sections?: { role: string; name: string; blueprint: string | null }[]
  photos?: { title?: string; note?: string }
}

export function optionsText(options: DirectionOption[]): string {
  return [
    'Trois directions tirées. Choisis celle qui peut porter un élément propre au client (pas la plus familière), puis direction({…mêmes arguments…, choix:"<id>"}) :',
    ...options.map((o) => [
      `## ${o.id} — ${o.name}`,
      `Idée : ${o.idea}`,
      `Composition : ${o.composition}`,
      ...(o.needs ? [`Demande : ${o.needs}`] : []),
    ].join('\n')),
  ].join('\n\n')
}

const line = (label: string, value: string | undefined) => (value ? [`${label} : ${value}`] : [])

/** Fiche complète d'une direction : idée, hero, typographie, palette, sections, photos. */
export function sheetText(sheet: FullSheet): string {
  const d = sheet.direction
  const p = sheet.palette
  const roles: [string, string | undefined][] = [['Fond', p.bg], ['Surface', p.surface], ['Encre', p.ink], ['Discret', p.muted], ['Accent', p.accent], ['Sur accent', p.accentInk]]
  const out: string[] = [
    `# ${d?.name ?? 'Direction'}${d?.id ? ` (${d.id})` : ''}${sheet.seed ? ` — tirage ${sheet.seed}` : ''}`,
    ...line('Idée', d?.idea),
    ...line('Composition', d?.composition),
    ...line('Typographie', d?.typography),
    ...line('Couleur', d?.colour),
    ...line('Images', d?.imagery),
    ...line('Richesse', d?.richness),
    ...line('Pièges', d?.pitfalls),
  ]
  if (sheet.hero) out.push('', `## Hero — ${sheet.hero.name}`, sheet.hero.blueprint, ...line('Titre', sheet.hero.headline))
  const t = sheet.type
  out.push(
    '',
    `## Typographie${t.name ? ` — ${t.name}` : ''}`,
    `Titres : ${t.display.family}${t.display.settings ? ` (${t.display.settings})` : ''}`,
    `Texte : ${t.text.family}${t.text.settings ? ` (${t.text.settings})` : ''}`,
    ...line('Note', t.note),
  )
  out.push(
    '',
    `## Palette${p.name ? ` — ${p.name}` : ''}`,
    roles.filter(([, v]) => v).map(([n, v]) => `${n} ${v}`).join(' · '),
    ...(p.fields ?? []).map((f, i) => `Aplat ${i + 1} ${f.bg}${f.ink ? ` (texte ${f.ink})` : ''}`),
    ...line('Note', p.note),
  )
  const sections = (sheet.sections ?? []).filter((s) => s.blueprint)
  if (sections.length) {
    out.push('', '## Sections (dans l’ordre) — construis chacune d’après son plan, avec le contenu du client')
    for (const s of sections) out.push(`- ${s.role} — ${s.name} : ${s.blueprint}`)
  }
  if (sheet.photos?.title) out.push('', `## Photos : ${sheet.photos.title}${sheet.photos.note ? ` (${sheet.photos.note})` : ''}`)
  out.push(
    '',
    'Unités web des plans : sur un cadre de 1440, 1vw = 14,4 px ; écran de 900 de haut, 1vh = 9 px. Pas de mouvement : maquette fixe.',
    'appliquer:true (mêmes arguments) crée Fond, Surface, Encre, Discret, Accent, Sur accent, Aplats et les styles Titre 1/2/3, Texte large, Texte, Petit.',
  )
  return out.join('\n')
}
