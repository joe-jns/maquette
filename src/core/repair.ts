import { normalizeColor, normalizeColorValue } from './color'
import { autoLayoutDefaults, createNode } from './defaults'
import { alignTextSizing } from './fixes'
import { FALLBACK_ICONS, isIconSet, normalizeIconWeight, resolveIconIn, toIconSet } from './icons/sets'
import { newId } from './ids'
import { isImageFill, normalizeFill, parseImageFill } from './paint'
import { formatPath, type Issue } from './rules'
import { HEX_COLOR } from './schema'
import { isFill, isHug } from './tree'
import type { Axis, Color, Fill, IconSet, NodeInput, NodeType, Size, TextNode } from './types'
import { isValidPath, pathBounds } from './vector'

/**
 * Ouverture tolérante (spec §6.2) : ramène un document lu sur disque à l'état valide le plus proche.
 * Chaque réparation ajoute un avertissement ; compléter une propriété absente par sa valeur par
 * défaut n'en ajoute pas. Une valeur de mauvais type qu'aucune règle ne sait réparer est laissée
 * telle quelle : `validateDocument` la refusera ensuite. `raw` n'est jamais modifié.
 */

type Obj = Record<string, unknown>
type Segs = (string | number)[]

const MAGENTA = '#FF00FF'
const FALLBACK_SIZE = 100
const ID = /^[^/$][^/]*$/
const AXES: Axis[] = ['width', 'height']
const NODE_TYPES: readonly NodeType[] = ['frame', 'text', 'shape', 'image', 'icon', 'vector']

const COMMON_KEYS = [
  'id', 'type', 'name', 'visible', 'locked', 'opacity', 'width', 'height', 'x', 'y', 'position', 'alignSelf',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
]
const BLUR_KEYS = ['blur', 'backgroundBlur']
const NODE_KEYS: Record<NodeType, ReadonlySet<string>> = {
  frame: new Set([...COMMON_KEYS, ...BLUR_KEYS, 'children', 'layout', 'fills', 'stroke', 'radius', 'shadows', 'clip']),
  text: new Set([
    ...COMMON_KEYS, 'content', 'fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing',
    'textAlign', 'color', 'textStyle', 'textSizing',
  ]),
  shape: new Set([...COMMON_KEYS, ...BLUR_KEYS, 'shape', 'fills', 'stroke', 'radius', 'shadows']),
  image: new Set([...COMMON_KEYS, ...BLUR_KEYS, 'src', 'fit', 'radius', 'stroke', 'shadows']),
  icon: new Set([...COMMON_KEYS, 'icon', 'set', 'weight', 'filled', 'color', 'strokeWidth']),
  vector: new Set([...COMMON_KEYS, ...BLUR_KEYS, 'path', 'viewBox', 'fillRule', 'fills', 'stroke', 'shadows']),
}
const AUTO_LAYOUT_KEYS = new Set(['mode', 'direction', 'gap', 'padding', 'justify', 'align', 'wrap', 'rowGap', 'reverseZ'])
const STROKE_KEYS = new Set(['color', 'width', 'align'])
const SHADOW_KEYS = new Set(['x', 'y', 'blur', 'spread', 'color', 'inset'])
const COLOR_STYLE_KEYS = new Set(['id', 'name', 'value'])
const TEXT_STYLE_KEYS = new Set(['id', 'name', 'fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing'])
const TEXT_STYLE_DEFAULTS = { fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 16, lineHeight: 19, letterSpacing: 0 }
const ROOT_KEYS = new Set(['format', 'version', 'styles', 'pages'])
const PAGE_KEYS = new Set(['id', 'name', 'children'])
const MIN_MAX: [string, string][] = [['minWidth', 'maxWidth'], ['minHeight', 'maxHeight']]

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isSize = (v: unknown): v is Size => typeof v === 'number' || isObj(v)
const hug = (v: unknown) => isSize(v) && isHug(v)
const fill = (v: unknown) => isSize(v) && isFill(v)
const show = (v: unknown) => (typeof v === 'string' ? `“${v}”` : JSON.stringify(v))

/** Tous les identifiants écrits dans le fichier, pour que les nouveaux n'en reprennent aucun. */
function collectIds(v: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => collectIds(x, into))
  else if (isObj(v)) {
    if (typeof v.id === 'string') into.add(v.id)
    Object.values(v).forEach((x) => collectIds(x, into))
  }
  return into
}

export function repairDocument(raw: Record<string, unknown>): { doc: unknown; warnings: Issue[] } {
  const src = structuredClone(raw)
  const warnings: Issue[] = []
  const warn = (segs: Segs, message: string) => warnings.push({ path: formatPath(segs), message })

  const taken = collectIds(src, new Set())
  const seen = new Set<string>()
  const claim = (v: unknown, segs: Segs): string => {
    if (typeof v === 'string' && ID.test(v) && !seen.has(v)) {
      seen.add(v)
      return v
    }
    const id = newId(taken)
    taken.add(id)
    seen.add(id)
    const why =
      v === undefined ? 'missing' : typeof v === 'string' && ID.test(v) ? `duplicated (${v})` : `invalid (${show(v)})`
    warn([...segs, 'id'], `id ${why}: replaced with ${id}`)
    return id
  }

  /** Retire les propriétés hors de `allowed` et renvoie une copie. */
  const dropUnknown = (o: Obj, allowed: ReadonlySet<string>, segs: Segs, what = 'unknown property'): Obj => {
    const out: Obj = {}
    for (const [k, v] of Object.entries(o)) {
      if (allowed.has(k)) out[k] = v
      else warn([...segs, k], `${what} ${show(k)} removed`)
    }
    return out
  }

  for (const k of Object.keys(src)) if (!ROOT_KEYS.has(k)) warn([k], `unknown property ${show(k)} removed`)

  // 1. Styles nommés
  const styles = repairStyles()
  const colorIds = new Set(styles.colors.map((s) => s.id as string))
  const textIds = new Set(styles.text.map((s) => s.id as string))

  function repairStyles(): { colors: Obj[]; text: Obj[] } {
    let s = src.styles
    if (s === undefined) s = {}
    if (!isObj(s)) {
      warn(['styles'], `unreadable styles (${show(s)}): replaced with an empty list`)
      s = {}
    }
    const st = dropUnknown(s as Obj, new Set(['colors', 'text']), ['styles'])
    const list = (key: 'colors' | 'text'): unknown[] => {
      const v = st[key]
      if (v === undefined) return []
      if (Array.isArray(v)) return v
      warn(['styles', key], `unreadable style list (${show(v)}): replaced with an empty list`)
      return []
    }
    const entries = (key: 'colors' | 'text', allowed: ReadonlySet<string>, fixEntry: (e: Obj, segs: Segs, n: number) => void) => {
      const out: Obj[] = []
      list(key).forEach((e, i) => {
        const segs: Segs = ['styles', key, i]
        if (!isObj(e)) return warn(segs, 'unreadable style (not an object): removed')
        const entry = dropUnknown(e, allowed, segs)
        entry.id = claim(entry.id, segs)
        fixEntry(entry, segs, out.length + 1)
        out.push(entry)
      })
      return out
    }
    const fixName = (e: Obj, segs: Segs, fallback: string) => {
      if (e.name === undefined) e.name = fallback
      else if (typeof e.name !== 'string' || e.name === '') {
        warn([...segs, 'name'], `invalid name (${show(e.name)}): replaced with “${fallback}”`)
        e.name = fallback
      }
    }
    const colors = entries('colors', COLOR_STYLE_KEYS, (e, segs, n) => {
      fixName(e, segs, `Color ${n}`)
      const v = e.value
      if (typeof v === 'string' && HEX_COLOR.test(v)) return
      const norm = typeof v === 'string' ? normalizeColor(v) : null
      if (norm) warn([...segs, 'value'], `color ${show(v)} converted to ${norm}`)
      else warn([...segs, 'value'], `color ${v === undefined ? 'missing' : `unreadable (${show(v)})`}: replaced with ${MAGENTA}`)
      e.value = norm ?? MAGENTA
    })
    const text = entries('text', TEXT_STYLE_KEYS, (e, segs, n) => {
      fixName(e, segs, `Style ${n}`)
      for (const [k, d] of Object.entries(TEXT_STYLE_DEFAULTS)) if (e[k] === undefined) e[k] = d
    })
    return { colors, text }
  }

  const fixColor = (v: unknown, segs: Segs): Color => {
    if (typeof v === 'string' && HEX_COLOR.test(v)) return v
    const norm = normalizeColorValue(v)
    if (norm === null) {
      warn(segs, `unreadable color (${show(v)}): replaced with ${MAGENTA}`)
      return MAGENTA
    }
    if (typeof norm === 'object') {
      if (colorIds.has(norm.style)) return norm
      warn(segs, `unknown color variable ${show(norm.style)}: reference detached, replaced with ${MAGENTA}`)
      return MAGENTA
    }
    warn(segs, `color ${show(v)} converted to ${norm}`)
    return norm
  }

  /** Remplissage : couleur (voir fixColor), image, ou dégradé dont chaque arrêt passe par fixColor. */
  const fixFill = (v: unknown, segs: Segs): Fill => {
    if (!isObj(v) || typeof v.type !== 'string') return fixColor(v, segs)
    if (v.type.toLowerCase() === 'image') {
      const img = parseImageFill(v)
      if (img === null) {
        warn(segs, `unreadable image fill (${show(v)}): replaced with ${MAGENTA}`)
        return MAGENTA
      }
      if (JSON.stringify(img) !== JSON.stringify(v)) warn(segs, 'image fill rewritten in Maquette format')
      return img
    }
    const g = normalizeFill(v)
    if (g === null || typeof g !== 'object' || !('stops' in g)) {
      warn(segs, `unreadable gradient (${show(v)}): replaced with ${MAGENTA}`)
      return MAGENTA
    }
    if (JSON.stringify(g) !== JSON.stringify(v)) warn(segs, 'gradient rewritten in Maquette format')
    g.stops.forEach((st, k) => { st.color = fixColor(st.color, [...segs, 'stops', k, 'color']) })
    return g
  }

  /**
   * Vecteur : tracé illisible remplacé par un rectangle, viewBox absente calculée d'après le tracé
   * (illisible : idem, signalée), règle de remplissage inconnue ramenée à nonzero, images retirées.
   */
  const repairVector = (node: Obj, given: Obj, s: Segs): void => {
    const box = (v: unknown): v is number[] =>
      Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && v[2] > 0 && v[3] > 0
    if (typeof node.path !== 'string' || !isValidPath(node.path)) {
      const [x, y, w, h] = box(given.viewBox) ? given.viewBox : [0, 0, 100, 100]
      const rect = `M${x} ${y}h${w}v${h}h${-w}Z`
      warn([...s, 'path'], `unreadable path (${show(node.path)}): replaced with a rectangle`)
      node.path = rect
    }
    if (!box(given.viewBox)) {
      const bounds = pathBounds(node.path as string) ?? [0, 0, 100, 100]
      if (given.viewBox !== undefined) warn([...s, 'viewBox'], `invalid viewBox (${show(given.viewBox)}): replaced with the path bounds ${show(bounds)}`)
      node.viewBox = bounds
    }
    if (node.fillRule !== 'nonzero' && node.fillRule !== 'evenodd') {
      warn([...s, 'fillRule'], `unknown fillRule ${show(node.fillRule)}: replaced with "nonzero"`)
      node.fillRule = 'nonzero'
    }
    if (Array.isArray(node.fills)) {
      node.fills = (node.fills as Fill[]).filter((f, i) => {
        if (!isImageFill(f)) return true
        warn([...s, 'fills', i], 'image fill not possible on a vector: removed')
        return false
      })
    }
  }

  // 2. Pages (identifiants réservés avant ceux des éléments, comme dans validateDocument)
  const pageSrc: unknown[] = Array.isArray(src.pages) ? src.pages : []
  if (src.pages !== undefined && !Array.isArray(src.pages)) warn(['pages'], `unreadable page list (${show(src.pages)})`)
  const pages: { page: Obj; children: unknown; segs: Segs }[] = []
  pageSrc.forEach((p, i) => {
    const segs: Segs = ['pages', i]
    if (!isObj(p)) return warn(segs, 'unreadable page (not an object): removed')
    const page = dropUnknown(p, PAGE_KEYS, segs)
    const fallback = `Page ${pages.length + 1}`
    const out: Obj = { id: claim(page.id, segs), name: page.name, children: [] }
    if (out.name === undefined) out.name = fallback
    else if (typeof out.name !== 'string' || out.name === '') {
      warn([...segs, 'name'], `invalid page name (${show(out.name)}): replaced with “${fallback}”`)
      out.name = fallback
    }
    pages.push({ page: out, children: page.children, segs })
  })
  if (pages.length === 0) {
    const id = newId(taken)
    taken.add(id)
    warn(['pages'], 'the document has no pages: an empty “Page 1” was added')
    pages.push({ page: { id, name: 'Page 1', children: [] }, children: [], segs: ['pages', 0] })
  }

  // 3 à 7. Éléments, un par un, du parent vers les enfants
  const repairList = (list: unknown[], parent: Obj | null, segs: Segs): Obj[] => {
    const out: Obj[] = []
    list.forEach((item, i) => {
      const s: Segs = [...segs, 'children', i]
      if (!isObj(item)) return warn(s, 'unreadable layer (not an object): removed')
      if (!NODE_TYPES.includes(item.type as NodeType)) {
        return warn(s, item.type === undefined ? 'layer without a type: removed' : `unknown layer type ${show(item.type)}: layer removed`)
      }
      out.push(repairNode(item, parent, s))
    })
    return out
  }

  const repairNode = (item: Obj, parent: Obj | null, s: Segs): Obj => {
    const type = item.type as NodeType
    const id = claim(item.id, s)
    const seed: Obj = { type }
    if (type === 'shape' && typeof item.shape === 'string') seed.shape = item.shape
    if (type === 'text' && typeof item.fontSize === 'number') seed.fontSize = item.fontSize
    if (type === 'icon' && typeof item.icon === 'string') seed.icon = item.icon
    const node = createNode(seed as NodeInput, id) as unknown as Obj
    const given = dropUnknown(item, NODE_KEYS[type], s)
    for (const [k, v] of Object.entries(given)) if (k !== 'id' && k !== 'type' && k !== 'children' && k !== 'layout') node[k] = v

    // Mise en page d'un cadre
    if (type === 'frame' && given.layout !== undefined) {
      const l = given.layout
      if (isObj(l) && l.mode === 'auto') node.layout = { ...autoLayoutDefaults(), ...dropUnknown(l, AUTO_LAYOUT_KEYS, [...s, 'layout']) }
      else if (isObj(l) && l.mode === 'free') node.layout = dropUnknown(l, new Set(['mode']), [...s, 'layout'], 'property with no effect in free layout')
      else warn([...s, 'layout'], 'unreadable layout: replaced with free layout')
    }

    // Couleurs et références de style
    if (Array.isArray(node.fills)) node.fills = node.fills.map((c, i) => fixFill(c, [...s, 'fills', i]))
    if (type === 'vector') repairVector(node, given, s)
    if (type === 'text' || type === 'icon') node.color = fixColor(node.color, [...s, 'color'])
    if (type === 'icon') {
      if (!isIconSet(node.set)) {
        const to = toIconSet(node.set) ?? 'lucide'
        warn([...s, 'set'], `unknown icon set ${show(node.set)}: replaced with ${show(to)}`)
        node.set = to
      }
      const set = node.set as IconSet
      const known = typeof node.icon === 'string' ? resolveIconIn(set, node.icon) : null
      if (known !== node.icon) {
        const to = known ?? FALLBACK_ICONS[set]
        warn([...s, 'icon'], known ? `icon ${show(node.icon)} renamed to ${show(to)}` : `unknown icon ${show(node.icon)}: replaced with ${show(to)}`)
        node.icon = to
      }
      if (node.weight !== undefined) {
        const w = normalizeIconWeight(set, node.weight)
        if (w === undefined) {
          warn([...s, 'weight'], `weight ${show(node.weight)} does not apply to ${set} icons: removed`)
          delete node.weight
        } else if (w !== node.weight) {
          warn([...s, 'weight'], `weight ${show(node.weight)} changed to ${show(w)}`)
          node.weight = w
        }
      }
      if (node.filled !== undefined && (set !== 'material-rounded' || typeof node.filled !== 'boolean')) {
        warn([...s, 'filled'], set === 'material-rounded' ? 'unreadable filled: removed' : `filled does not apply to ${set} icons: removed`)
        delete node.filled
      }
    }
    if (isObj(node.stroke)) {
      const stroke = dropUnknown(node.stroke, STROKE_KEYS, [...s, 'stroke'])
      if (stroke.color !== undefined) stroke.color = fixColor(stroke.color, [...s, 'stroke', 'color'])
      node.stroke = stroke
    }
    if (Array.isArray(node.shadows)) {
      node.shadows = node.shadows.map((sh, i) => {
        if (!isObj(sh)) return sh
        const shadow = dropUnknown(sh, SHADOW_KEYS, [...s, 'shadows', i])
        if (shadow.color !== undefined) shadow.color = fixColor(shadow.color, [...s, 'shadows', i, 'color'])
        return shadow
      })
    }
    if (type === 'text' && typeof node.textStyle === 'string' && !textIds.has(node.textStyle)) {
      warn([...s, 'textStyle'], `unknown text style ${show(node.textStyle)}: reference detached`)
      delete node.textStyle
    }

    // Règles du §6
    const autoParent = isObj(parent?.layout) && parent.layout.mode === 'auto'
    if (node.position === 'absolute' && !autoParent) {
      warn([...s, 'position'], '"absolute" only applies inside an auto layout frame: reset to "flow"')
      node.position = 'flow'
    }
    const inFlow = autoParent && node.position === 'flow'
    const autoSelf = type === 'frame' && isObj(node.layout) && node.layout.mode === 'auto'

    const present = (['x', 'y'] as const).filter((k) => node[k] !== undefined)
    if (inFlow && present.length) {
      warn([...s, present[0]!], 'position is set by auto layout: x and y removed')
      delete node.x
      delete node.y
    } else if (!inFlow && present.length < 2) {
      const missing = (['x', 'y'] as const).filter((k) => node[k] === undefined)
      warn([...s, missing[0]!], `${missing.join(' and ')} missing outside the flow: set to 0`)
      for (const k of missing) node[k] = 0
    }
    if (node.alignSelf !== undefined && !inFlow) {
      warn([...s, 'alignSelf'], 'alignSelf only applies to a flow child of an auto layout frame: removed')
      delete node.alignSelf
    }

    for (const axis of AXES) {
      if (hug(node[axis]) && !(type === 'text' || autoSelf)) {
        warn([...s, axis], `"hug" not possible here (neither auto layout frame nor text): ${axis} set to ${FALLBACK_SIZE} px`)
        node[axis] = FALLBACK_SIZE
      } else if (fill(node[axis]) && !inFlow) {
        warn([...s, axis], `"fill" not possible outside the flow of an auto layout frame: ${axis} set to ${FALLBACK_SIZE} px`)
        node[axis] = FALLBACK_SIZE
      }
    }

    const bounds = MIN_MAX.flat().filter((k) => node[k] !== undefined)
    if (bounds.length && !(autoParent || autoSelf)) {
      for (const k of bounds) {
        warn([...s, k], `${k} only applies to an auto layout frame or its direct children: removed`)
        delete node[k]
      }
    } else {
      for (const [min, max] of MIN_MAX) {
        const lo = node[min]
        const hi = node[max]
        if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) {
          warn([...s, max], `${max} (${hi}) lower than ${min} (${lo}): ${max} removed`)
          delete node[max]
        }
      }
    }

    if (autoSelf) {
      const layout = node.layout as Obj
      if (layout.rowGap !== undefined && layout.wrap !== true) {
        warn([...s, 'layout', 'rowGap'], 'rowGap only applies with wrap: removed')
        delete layout.rowGap
      }
      if (layout.align === 'baseline' && layout.direction !== 'row') {
        warn([...s, 'layout', 'align'], '"baseline" only exists in the "row" direction: replaced with "start"')
        layout.align = 'start'
      }
    }

    if (type === 'text' && isSize(node.width) && isSize(node.height)) {
      const before = { height: node.height, textSizing: node.textSizing }
      if (alignTextSizing(node as unknown as TextNode)) {
        const silent = given.textSizing === undefined && node.height === before.height
        if (!silent) {
          warn([...s, 'textSizing'], `textSizing ${show(before.textSizing)} does not match the sizes: changed to ${show(node.textSizing)}`)
        }
      }
    }

    // Enfants, puis règle 3 (parent "hug" qui contient un enfant "fill" sur le même axe)
    if (type === 'frame') {
      if (Array.isArray(given.children)) node.children = repairList(given.children, node, s)
      else if (given.children !== undefined) node.children = given.children
      if (autoSelf && Array.isArray(node.children)) {
        const children = node.children as unknown[]
        for (const axis of AXES) {
          const fillChild = children.some((c) => isObj(c) && c.position === 'flow' && fill(c[axis]))
          if (hug(node[axis]) && fillChild) {
            warn([...s, axis], `"hug" frame with a "fill" child on the same axis: ${axis} set to ${FALLBACK_SIZE} px`)
            node[axis] = FALLBACK_SIZE
          }
        }
      }
    }
    return node
  }

  const outPages = pages.map(({ page, children, segs }) => {
    if (Array.isArray(children)) page.children = repairList(children, null, segs)
    else if (children !== undefined) page.children = children
    return page
  })

  return { doc: { format: src.format, version: src.version, styles, pages: outPages }, warnings }
}
