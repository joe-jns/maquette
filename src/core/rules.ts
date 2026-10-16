import { DocumentSchema } from './schema'
import { isFill, isHug, walk } from './tree'
import type { Axis, Color, MaquetteDocument, Node } from './types'

export interface Issue { path: string; message: string }

export function formatPath(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((acc, s) => {
    if (typeof s === 'number') return `${acc}[${s}]`
    return acc ? `${acc}.${String(s)}` : String(s)
  }, '')
}

const AXES: Axis[] = ['width', 'height']

/** Vérifie le schéma puis les règles de la spec (§6). Renvoie [] si le document est valide. */
export function validateDocument(doc: MaquetteDocument): Issue[] {
  const parsed = DocumentSchema.safeParse(doc)
  if (!parsed.success) return parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))

  const issues: Issue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (doc.pages.length === 0) add('pages', 'le document doit avoir au moins une page')

  const colorIds = new Set(doc.styles.colors.map((s) => s.id))
  const textIds = new Set(doc.styles.text.map((s) => s.id))
  const seen = new Set<string>()
  const claim = (id: string, path: string) => {
    if (seen.has(id)) add(path, `identifiant en double : ${id}`)
    seen.add(id)
  }
  doc.styles.colors.forEach((s, i) => claim(s.id, `styles.colors[${i}].id`))
  doc.styles.text.forEach((s, i) => claim(s.id, `styles.text[${i}].id`))
  doc.pages.forEach((p, i) => claim(p.id, `pages[${i}].id`))

  const checkColor = (c: Color, path: string) => {
    if (typeof c === 'object' && !colorIds.has(c.style)) add(path, `couleur nommée inconnue : ${c.style}`)
  }

  walk(doc, ({ node, parent, path }) => {
    claim(node.id, `${path}.id`)
    const autoParent = parent?.layout.mode === 'auto'
    const inFlow = autoParent && node.position === 'flow'
    const autoSelf = node.type === 'frame' && node.layout.mode === 'auto'

    for (const axis of AXES) {
      const size = node[axis]
      if (isHug(size) && !(node.type === 'text' || autoSelf)) {
        add(`${path}.${axis}`, '"hug" n’est permis que pour un cadre en mise en page automatique ou un texte')
      }
      if (isFill(size) && !inFlow) {
        add(`${path}.${axis}`, '"fill" n’est permis que pour un enfant en flux d’un cadre en mise en page automatique')
      }
      if (node.type === 'frame' && autoSelf && isHug(size)) {
        const fillChild = node.children.some((c) => c.position === 'flow' && isFill(c[axis]))
        if (fillChild) add(`${path}.${axis}`, `un cadre en "hug" ne peut pas contenir un enfant en "fill" sur le même axe (${axis})`)
      }
    }

    if (node.position === 'absolute' && !autoParent) {
      add(`${path}.position`, '"absolute" n’a de sens que dans un cadre en mise en page automatique')
    }
    if (inFlow && (node.x !== undefined || node.y !== undefined)) {
      add(`${path}.x`, 'la position d’un enfant en flux est calculée par la mise en page automatique : x et y interdits')
    }
    if (!inFlow && (node.x === undefined || node.y === undefined)) {
      add(`${path}.x`, 'x et y sont obligatoires hors du flux d’un cadre automatique')
    }
    if (node.alignSelf !== undefined && !inFlow) {
      add(`${path}.alignSelf`, 'alignSelf n’a de sens que pour un enfant en flux d’un cadre automatique')
    }

    const hasMinMax = [node.minWidth, node.maxWidth, node.minHeight, node.maxHeight].some((v) => v !== undefined)
    if (hasMinMax && !(autoParent || autoSelf)) {
      add(`${path}.minWidth`, 'min/max ne s’appliquent qu’à un cadre automatique ou à ses enfants directs')
    } else {
      if (node.minWidth !== undefined && node.maxWidth !== undefined && node.minWidth > node.maxWidth) {
        add(`${path}.minWidth`, 'minWidth doit être inférieur ou égal à maxWidth')
      }
      if (node.minHeight !== undefined && node.maxHeight !== undefined && node.minHeight > node.maxHeight) {
        add(`${path}.minHeight`, 'minHeight doit être inférieur ou égal à maxHeight')
      }
    }

    checkPaint(node, path, checkColor)

    if (node.type === 'frame' && node.layout.mode === 'auto') {
      if (node.layout.rowGap !== undefined && !node.layout.wrap) {
        add(`${path}.layout.rowGap`, 'rowGap n’a de sens qu’avec le retour à la ligne (wrap)')
      }
      if (node.layout.align === 'baseline' && node.layout.direction !== 'row') {
        add(`${path}.layout.align`, '"baseline" n’existe qu’en direction "row"')
      }
    }

    if (node.type === 'text') {
      const wHug = isHug(node.width)
      const hHug = isHug(node.height)
      const ok =
        node.textSizing === 'auto' ? wHug && hHug : node.textSizing === 'auto-height' ? !wHug && hHug : !wHug && !hHug
      if (!ok) {
        const expected = {
          auto: 'width et height en "hug"',
          'auto-height': 'width fixe ou "fill", height en "hug"',
          fixed: 'width et height fixes ou "fill"',
        }[node.textSizing]
        add(`${path}.textSizing`, `"${node.textSizing}" exige ${expected}`)
      }
      if (node.textStyle !== undefined && !textIds.has(node.textStyle)) {
        add(`${path}.textStyle`, `style de texte inconnu : ${node.textStyle}`)
      }
    }
  })

  return issues
}

function checkPaint(node: Node, path: string, checkColor: (c: Color, path: string) => void): void {
  if (node.type === 'frame' || node.type === 'shape') node.fills.forEach((c, i) => checkColor(c, `${path}.fills[${i}]`))
  if (node.type === 'text') checkColor(node.color, `${path}.color`)
  if (node.type !== 'text') {
    if (node.stroke) checkColor(node.stroke.color, `${path}.stroke.color`)
    node.shadows.forEach((s, i) => checkColor(s.color, `${path}.shadows[${i}].color`))
  }
}
