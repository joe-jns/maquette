/**
 * Outils MCP de design : `guide` (textes lus à la demande), `style` (styles archétypes de Pen) et
 * `direction` (taste-skill). Code pur ; les fichiers et le tirage passent par `ToolHost.design`.
 */
import { z } from 'zod'
import { formatPath } from '../../core/rules'
import type { TasteDraw } from '../../shared/ipc'
import { applyDirectionOps, directionStyles, SECTORS, TONES, type DirectionOption, type DirectionStyles } from '../../taste/direction'
import type { ToolDef, ToolHost, ToolResult } from '../tools'
import { optionsText, sheetText, type FullSheet } from './direction'
import { annexesOf, findGuide, summary, TOPIC_PATTERN } from './guide'
import { findStyle, findVariant, listStyles, listVariants, styleSheet, styleStyles, variantLabel, variantsOf, type StyleLibrary } from './styles'

export interface DrawArgs { sector: string; brief: string; tone?: string; sections?: string[] }

/** Ce que la fenêtre fournit aux outils de design. */
export interface DesignHost {
  /** Texte d'un fichier de vendor/design ; null si refusé ou absent. */
  read(path: string): Promise<string | null>
  tasteOptions(input: DrawArgs): Promise<TasteDraw<DirectionOption[]>>
  tasteDirection(input: DrawArgs & { direction: string }): Promise<TasteDraw<FullSheet>>
  /** Charge des polices ; renvoie celles qui n'ont pas pu l'être (hors connexion, introuvables). */
  loadFonts(families: string[]): Promise<string[]>
}

const ids = (list: { id: string }[]) => list.map((x) => x.id) as [string, ...string[]]

export const DESIGN_INPUTS = {
  guide: { sujet: z.string().max(80).optional() },
  style: {
    nom: z.string().min(1).max(80).optional(),
    variante: z.string().min(1).max(80).optional(),
    appliquer: z.boolean().optional(),
  },
  direction: {
    secteur: z.enum(ids(SECTORS)),
    brief: z.string().min(1).max(300),
    ton: z.enum(ids(TONES)).optional(),
    sections: z.array(z.string().regex(/^[a-z-]+$/)).min(1).max(10).optional(),
    choix: z.string().min(1).max(60).optional(),
    appliquer: z.boolean().optional(),
  },
} satisfies Record<string, z.ZodRawShape>

type DesignTool = keyof typeof DESIGN_INPUTS

export const DESIGN_TOOLS: ToolDef[] = [
  {
    name: 'guide',
    description: 'Guides de design lus à la demande. Sans sujet : sommaire. guide("landing-page"), guide("methode"), guide("regles-maison"), guide("better-typography")…',
    input: DESIGN_INPUTS.guide,
  },
  {
    name: 'style',
    description: 'Styles archétypes de Pen. Sans nom : liste ; style(nom) : variantes ; style(nom, variante) : fiche (identité, composition, polices et graisses, palette, arrondis, élévation, imagerie). appliquer:true crée couleurs nommées et styles de texte (une annulation).',
    input: DESIGN_INPUTS.style,
  },
  {
    name: 'direction',
    description: 'Direction artistique taste-skill : pour un secteur et un brief : 3 directions, puis choix:id pour la fiche (hero, typo, palette, sections). appliquer:true crée couleurs nommées et styles de texte (une annulation). sections : rôles dans l’ordre (intro, features, gallery, pricing, faq, contact, footer…).',
    input: DESIGN_INPUTS.direction,
  },
]

export const isDesignTool = (name: string): name is DesignTool => Object.hasOwn(DESIGN_INPUTS, name)

const error = (text: string): ToolResult => ({ text, isError: true })
const UNAVAILABLE = error('outil indisponible : les guides et styles de design ne sont pas accessibles ici')

export async function runDesignTool(host: ToolHost, name: DesignTool, args: unknown): Promise<ToolResult> {
  const parsed = z.strictObject(DESIGN_INPUTS[name]).safeParse(args ?? {})
  if (!parsed.success) {
    const lines = parsed.error.issues.slice(0, 5).map((i) => `${formatPath(i.path) || '(arguments)'} : ${i.message}`)
    return error(`arguments invalides pour ${name} :\n${lines.join('\n')}`)
  }
  const design = host.design
  if (!design) return UNAVAILABLE
  switch (name) {
    case 'guide':
      return guide(design, (parsed.data as { sujet?: string }).sujet)
    case 'style':
      return style(host, design, parsed.data as { nom?: string; variante?: string; appliquer?: boolean })
    case 'direction':
      return direction(host, design, parsed.data as unknown as DirectionArgs)
  }
}

// ——— guide ———

async function guide(design: DesignHost, sujet: string | undefined): Promise<ToolResult> {
  if (!sujet?.trim()) return { text: summary() }
  const topic = findGuide(sujet)
  if (!topic) {
    return error(`${TOPIC_PATTERN.test(sujet.trim().toLowerCase()) ? 'sujet inconnu' : 'sujet invalide'} : ${sujet.slice(0, 80)}\n${summary()}`)
  }
  const text = await design.read(topic.file)
  if (text === null) return error(`guide illisible : ${topic.id} (réinstallez Maquette)`)
  const annexes = annexesOf(topic)
  return { text: annexes.length ? `${text.trim()}\n\nAnnexes : ${annexes.map((a) => `guide("${a}")`).join(', ')}` : text.trim() }
}

// ——— style ———

const libraries = new WeakMap<DesignHost, Promise<StyleLibrary>>()

function library(design: DesignHost): Promise<StyleLibrary> {
  let lib = libraries.get(design)
  if (!lib) {
    lib = design.read('styles.json').then((text) => {
      if (text === null) throw new Error('styles illisibles (réinstallez Maquette)')
      return JSON.parse(text) as StyleLibrary
    })
    libraries.set(design, lib)
    lib.catch(() => libraries.delete(design))
  }
  return lib
}

async function style(host: ToolHost, design: DesignHost, a: { nom?: string; variante?: string; appliquer?: boolean }): Promise<ToolResult> {
  let lib: StyleLibrary
  try {
    lib = await library(design)
  } catch (e) {
    return error((e as Error).message)
  }
  if (!a.nom) {
    if (a.variante || a.appliquer) return error('nom du style manquant : style() donne la liste')
    return { text: listStyles(lib) }
  }
  const entry = findStyle(lib, a.nom)
  if (!entry) return error(`style inconnu : ${a.nom}. Styles : ${lib.styles.map((s) => s.name).join(', ')}`)
  const variants = variantsOf(lib, entry)
  let variant = a.variante ? findVariant(lib, entry, a.variante) : variants.length === 1 ? variants[0] : undefined
  if (a.variante && !variant) return error(`variante inconnue pour ${entry.name} : ${a.variante}. Variantes : ${variants.map(variantLabel).join(', ')}`)
  if (!variant) {
    if (a.appliquer) return error(`précise la variante : ${variants.map(variantLabel).join(', ')}`)
    return { text: listVariants(lib, entry) }
  }
  const sheet = styleSheet(lib, entry, variant)
  if (!a.appliquer) return { text: sheet }
  const applied = await applyStyles(host, design, styleStyles(lib, entry, variant), `style ${entry.name} — ${variantLabel(variant)}`)
  return applied.isError ? applied : { text: `${applied.text}\n\n${sheet}` }
}

// ——— direction ———

interface DirectionArgs { secteur: string; brief: string; ton?: string; sections?: string[]; choix?: string; appliquer?: boolean }

/** Fiches tirées, par tirage demandé : appliquer:true reprend la fiche montrée au lieu d'en tirer une autre. */
const sheets = new Map<string, FullSheet>()
const MAX_SHEETS = 8

async function direction(host: ToolHost, design: DesignHost, a: DirectionArgs): Promise<ToolResult> {
  const input: DrawArgs = { sector: a.secteur, brief: a.brief.trim(), ...(a.ton ? { tone: a.ton } : {}), ...(a.sections ? { sections: a.sections } : {}) }
  if (!a.choix) {
    if (a.appliquer) return error('choix manquant : tire d’abord 3 directions, puis direction({…, choix:"<id>", appliquer:true})')
    const r = await design.tasteOptions(input)
    return r.ok ? { text: optionsText(r.value) } : error(`tirage impossible : ${r.message}`)
  }
  const key = JSON.stringify([input.sector, input.brief, input.tone ?? '', input.sections ?? [], a.choix])
  let sheet = sheets.get(key)
  if (!sheet) {
    const r = await design.tasteDirection({ ...input, direction: a.choix })
    if (!r.ok) return error(`tirage impossible : ${r.message}`)
    sheet = r.value
    sheets.set(key, sheet)
    if (sheets.size > MAX_SHEETS) sheets.delete(sheets.keys().next().value!)
  }
  const text = sheetText(sheet)
  if (!a.appliquer) return { text }
  let styles: DirectionStyles
  try {
    styles = directionStyles(sheet)
  } catch (e) {
    return error(`fiche inutilisable : ${(e as Error).message}`)
  }
  const applied = await applyStyles(host, design, styles, `direction ${sheet.direction?.name ?? a.choix}`)
  return applied.isError ? applied : { text: `${applied.text}\n\n${text}` }
}

// ——— application ———

/**
 * Pose couleurs nommées et styles de texte en un seul lot (une annulation), comme l'onglet
 * Direction, charge les polices, et renvoie les identifiants par nom.
 */
async function applyStyles(host: ToolHost, design: DesignHost, styles: DirectionStyles, label: string): Promise<ToolResult> {
  const ops = applyDirectionOps(host.doc(), styles)
  let result
  try {
    result = host.apply(ops, `Claude : ${label}`)
  } catch (e) {
    return error(`application impossible : ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!result.ok) return error(`application refusée : ${result.errors.slice(0, 5).map((e) => `${e.path} : ${e.message}`).join(' ; ')}`)
  const doc = host.doc()
  const idOf = <T extends { id: string; name: string }>(list: T[], name: string) => list.find((s) => s.name === name)?.id
  const out: Record<string, unknown> = {
    ok: true,
    applique: label,
    couleurs: Object.fromEntries(styles.colors.map((c) => [c.name, idOf(doc.styles.colors, c.name)])),
    textes: Object.fromEntries(styles.text.map((t) => [t.name, idOf(doc.styles.text, t.name)])),
  }
  const missing = await design.loadFonts(styles.fonts.map((f) => f.family))
  if (missing.length) out.polices_non_chargees = missing
  return { text: JSON.stringify(out) }
}
