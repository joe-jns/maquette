import { useEffect, useState } from 'react'
import type { MaquetteDocument, Node } from '../../core/types'
import type { FontInfo } from '../../shared/ipc'
import { docStore } from '../state/store'

/** Familles déjà traitées : résultat (trouvée ou non) partagé par tous les appels. */
const loads = new Map<string, Promise<boolean>>()

/** Familles utilisées par une liste d'éléments, mémorisées par tableau (immer partage les branches inchangées). */
const familiesByList = new WeakMap<Node[], Set<string>>()

function familiesOf(nodes: Node[]): Set<string> {
  let set = familiesByList.get(nodes)
  if (set) return set
  set = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'text') set.add(node.fontFamily)
    else if (node.type === 'frame') for (const f of familiesOf(node.children)) set.add(f)
  }
  familiesByList.set(nodes, set)
  return set
}

/** Familles du document : textes de toutes les pages et styles de texte nommés. */
export function documentFamilies(doc: MaquetteDocument): string[] {
  const all = new Set<string>()
  for (const page of doc.pages) for (const f of familiesOf(page.children)) all.add(f)
  for (const style of doc.styles.text) all.add(style.fontFamily)
  all.delete('')
  return [...all]
}

const quoted = (family: string) => `"${family.replace(/["\\]/g, '\\$&')}"`

/** Description CSS d'une police pour document.fonts. */
const fontSpec = (family: string) => `16px ${quoted(family)}`

const PROBE_TEXT = 'mmmmmmmmmmlli WQ@#0123 àéß'
const BASES = ['monospace', 'serif', 'sans-serif']
let probe: CanvasRenderingContext2D | null = null

/**
 * La famille est-elle réellement dessinée ? document.fonts.check() ne le dit pas : il répond true
 * pour une famille qu'aucune @font-face ne déclare, même absente du système. On mesure donc le même
 * texte avec chaque police générique, seule puis précédée de la famille : une largeur différente
 * prouve que la famille a servi.
 */
function isRendered(family: string): boolean {
  probe ??= document.createElement('canvas').getContext('2d')
  if (!probe) return false
  for (const base of BASES) {
    probe.font = `72px ${base}`
    const alone = probe.measureText(PROBE_TEXT).width
    probe.font = `72px ${quoted(family)}, ${base}`
    if (probe.measureText(PROBE_TEXT).width !== alone) return true
  }
  return false
}

async function loadFont(family: string): Promise<boolean> {
  let css: string | null = null
  try {
    css = await window.maquette.fontCss(family)
  } catch {
    css = null
  }
  if (css) {
    const style = document.createElement('style')
    style.dataset.fontFamily = family
    style.textContent = css
    document.head.appendChild(style)
  }
  const spec = fontSpec(family)
  try {
    await document.fonts.load(spec)
  } catch {
    // Description refusée : la vérification ci-dessous tranche.
  }
  // Sans feuille, une police installée sur le système (Arial, Georgia…) est quand même trouvée.
  return css !== null || (document.fonts.check(spec) && isRendered(family))
}

/** Charge une famille une seule fois par session ; true si elle est utilisable à l'affichage. */
export function ensureFont(family: string): Promise<boolean> {
  let pending = loads.get(family)
  if (!pending) {
    pending = loadFont(family)
    loads.set(family, pending)
  }
  return pending
}

/** Charge les polices du document ; renvoie les familles introuvables. */
export async function ensureDocumentFonts(doc: MaquetteDocument): Promise<string[]> {
  const families = documentFamilies(doc)
  const found = await Promise.all(families.map(ensureFont))
  return families.filter((_f, i) => !found[i])
}

let catalog: FontInfo[] | null = null
let catalogPromise: Promise<FontInfo[]> | null = null

function loadCatalog(): Promise<FontInfo[]> {
  catalogPromise ??= window.maquette.fontCatalog().then(
    (list) => (catalog = list),
    () => {
      catalogPromise = null // nouvel essai au prochain montage
      return []
    },
  )
  return catalogPromise
}

/** Catalogue des polices, demandé une fois puis gardé en mémoire ; null tant qu'il n'est pas arrivé. */
export function useFontCatalog(): FontInfo[] | null {
  const [list, setList] = useState<FontInfo[] | null>(catalog)
  useEffect(() => {
    if (catalog) return
    let alive = true
    void loadCatalog().then((l) => {
      if (alive) setList(l)
    })
    return () => {
      alive = false
    }
  }, [])
  return list
}

/** Message du bandeau pour une police qui n'a pas pu être chargée. */
export const missingFontMessage = (family: string) =>
  `Police introuvable : ${family} — remplacée à l’affichage par la police par défaut`

/**
 * Suit le document : charge chaque nouvelle famille et signale une fois chaque famille introuvable.
 * Renvoie la fonction de désabonnement.
 */
export function watchDocumentFonts(): () => void {
  const reported = new Set<string>()
  let lastDoc: MaquetteDocument | null = null
  let lastFamilies = ''
  const check = (doc: MaquetteDocument) => {
    if (doc === lastDoc) return
    lastDoc = doc
    const families = documentFamilies(doc)
    const key = families.join('\n')
    if (key === lastFamilies) return
    lastFamilies = key
    void ensureDocumentFonts(doc).then((missing) => {
      const fresh = missing.filter((f) => !reported.has(f))
      if (fresh.length === 0) return
      for (const f of fresh) reported.add(f)
      docStore.getState().showError(fresh.map(missingFontMessage).join(' · '))
    })
  }
  check(docStore.getState().doc)
  return docStore.subscribe((s) => check(s.doc))
}
