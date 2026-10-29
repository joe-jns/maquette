/**
 * Versions du format .pen. Pen migre ses fichiers version par version jusqu'à 2.21 ; on refait ici
 * les migrations qui changent le sens d'un fichier ancien (relevées dans l'app Pen 1.2.16) :
 * - 2.11 → 2.12 : `icon_font` devient `icon` (`iconFontName` → `icon`, `iconFontFamily` → `library`) ;
 * - 2.15 → 2.16 : un `group` avec layout devient un `frame` sans découpe, sinon il perd ses réglages de layout ;
 * - 2.18 → 2.19 : ombres « inner » relues comme externes, `spread` supprimé ;
 * - 2.19 → 2.20 : mode d'image `fill` → cover, `fit` → contain, absent → stretch (absent vaut cover ensuite).
 * Code pur : l'entrée n'est jamais modifiée (copie profonde).
 */

export const LATEST_PEN_VERSION: [number, number] = [2, 21]

/** « 2.17 » → [2, 17] ; null si illisible. */
export function parsePenVersion(v: unknown): [number, number] | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const m = /^(\d+)\.(\d+)$/.exec(String(v).trim())
  return m ? [Number(m[1]), Number(m[2])] : null
}

const before = (v: [number, number], major: number, minor: number) => v[0] < major || (v[0] === major && v[1] < minor)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Visite chaque nœud (enfants et remplacements des `descendants` compris). */
function eachNode(list: unknown, visit: (n: Obj) => void): void {
  if (!Array.isArray(list)) return
  for (const n of list) {
    if (!isObj(n)) continue
    visit(n)
    eachNode(n.children, visit)
    if (isObj(n.descendants)) for (const d of Object.values(n.descendants)) if (isObj(d)) {
      visit(d)
      eachNode(d.children, visit)
    }
  }
}

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])

/** Document .pen ramené au sens de la version 2.21 (copie). */
export function migratePen(doc: Obj, version: [number, number]): Obj {
  const out = structuredClone(doc)
  const kids = out.children
  if (before(version, 2, 12)) {
    eachNode(kids, (n) => {
      if (n.type === 'icon_font') n.type = 'icon'
      if ('iconFontName' in n) {
        n.icon = n.iconFontName
        delete n.iconFontName
      }
      if ('iconFontFamily' in n) {
        n.library = n.iconFontFamily
        delete n.iconFontFamily
      }
    })
  }
  if (before(version, 2, 16)) {
    eachNode(kids, (n) => {
      if (n.type !== 'group') return
      if (n.layout === 'horizontal' || n.layout === 'vertical') {
        n.type = 'frame'
        n.clip = false
      } else for (const k of ['layout', 'gap', 'padding', 'justifyContent', 'alignItems', 'layoutIncludeStroke']) delete n[k]
    })
  }
  if (before(version, 2, 19)) {
    eachNode(kids, (n) => {
      for (const e of asList(n.effect)) {
        if (!isObj(e) || e.type !== 'shadow') continue
        if (e.shadowType === 'inner') e.shadowType = 'outer'
        delete e.spread
      }
    })
  }
  if (before(version, 2, 20)) {
    const fix = (f: unknown) => {
      for (const i of asList(f)) {
        if (!isObj(i) || i.type !== 'image') continue
        i.mode = i.mode === 'fill' ? 'cover' : i.mode === 'fit' ? 'contain' : i.mode === undefined ? 'stretch' : i.mode
      }
    }
    eachNode(kids, (n) => {
      fix(n.fill)
      fix(n.stroke)
    })
  }
  out.version = `${LATEST_PEN_VERSION[0]}.${LATEST_PEN_VERSION[1]}`
  return out
}
