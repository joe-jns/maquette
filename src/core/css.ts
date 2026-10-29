import { gradientCss, isGradient, isImageFill } from './paint'
import type { Axis, Color, DocStyles, Fill, FrameNode, Node, Radius, Shadow, Stroke } from './types'

export type CSS = Record<string, string | number>

export const MISSING_COLOR = '#FF00FF'

const px = (n: number) => `${n}px`
const FLEX_ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' } as const
const FLEX_JUSTIFY = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly',
} as const

export function resolveColor(c: Color, styles: DocStyles): string {
  if (typeof c === 'string') return c
  return styles.colors.find((s) => s.id === c.style)?.value ?? MISSING_COLOR
}

const radiusCss = (r: Radius) => (typeof r === 'number' ? px(r) : r.map(px).join(' '))

const shadowCss = (s: Shadow, styles: DocStyles) =>
  `${s.inset ? 'inset ' : ''}${px(s.x)} ${px(s.y)} ${px(s.blur)} ${px(s.spread)} ${resolveColor(s.color, styles)}`

/** Adresse d'une image du document (`src` « assets/… ») ; par défaut le chemin tel quel. */
export type AssetUrl = (src: string) => string
const sameUrl: AssetUrl = (src) => src

/**
 * Styles CSS d'un élément. `parent === null` : élément posé directement sur la page. `url` résout
 * les images en remplissage (le canevas les sert par masset://).
 */
export function nodeCss(node: Node, parent: FrameNode | null, styles: DocStyles, index = 0, url: AssetUrl = sameUrl): CSS {
  const css: CSS = { boxSizing: 'border-box' }
  const parentAuto = parent?.layout.mode === 'auto' ? parent.layout : null
  const inFlow = parentAuto !== null && node.position === 'flow'

  if (inFlow) css.position = 'relative'
  else {
    css.position = 'absolute'
    css.left = px(node.x ?? 0)
    css.top = px(node.y ?? 0)
  }

  let crossFill = false
  for (const axis of ['width', 'height'] as Axis[]) {
    const size = node[axis]
    const isMain = parentAuto !== null && inFlow && (parentAuto.direction === 'row') === (axis === 'width')
    if (typeof size === 'number') {
      css[axis] = px(size)
      if (isMain) css.flexShrink = 0
    } else if (size.mode === 'hug') {
      if (isMain) css.flex = '0 0 auto'
      else if (!inFlow) css[axis] = 'fit-content'
      // Sans taille, align-items: stretch étirerait l'enfant : un hug suit toujours son contenu.
      else if (parentAuto?.align === 'stretch') css.alignSelf = 'flex-start'
    } else if (isMain) {
      css.flex = '1 1 0'
      css[axis === 'width' ? 'minWidth' : 'minHeight'] = '0px'
    } else {
      css.alignSelf = 'stretch'
      crossFill = inFlow
    }
  }
  if (node.minWidth !== undefined) css.minWidth = px(node.minWidth)
  if (node.maxWidth !== undefined) css.maxWidth = px(node.maxWidth)
  if (node.minHeight !== undefined) css.minHeight = px(node.minHeight)
  if (node.maxHeight !== undefined) css.maxHeight = px(node.maxHeight)
  // fill sur l'axe secondaire = étirement : un alignSelf explicite ne doit pas l'annuler.
  if (node.alignSelf !== undefined && !crossFill) css.alignSelf = FLEX_ALIGN[node.alignSelf]
  if (parentAuto?.reverseZ && parent) css.zIndex = parent.children.length - index

  if (node.opacity !== 1) css.opacity = node.opacity

  switch (node.type) {
    case 'frame': {
      if (node.layout.mode === 'auto') {
        const l = node.layout
        const main = l.gap === 'auto' ? 0 : l.gap
        const cross = l.rowGap ?? main
        Object.assign(css, {
          display: 'flex',
          flexDirection: l.direction,
          flexWrap: l.wrap ? 'wrap' : 'nowrap',
          padding: l.padding.map(px).join(' '),
          justifyContent: l.gap === 'auto' ? 'space-between' : FLEX_JUSTIFY[l.justify],
          alignItems: FLEX_ALIGN[l.align],
          columnGap: px(l.direction === 'row' ? main : cross),
          rowGap: px(l.direction === 'row' ? cross : main),
        })
      }
      if (node.clip) css.overflow = 'hidden'
      // Contours inside/center : couche au-dessus des enfants (frameStrokeCss), pas sur le cadre.
      paint(css, node.fills, node.stroke?.align === 'outside' ? node.stroke : undefined, node.shadows, styles, url)
      css.borderRadius = radiusCss(node.radius)
      break
    }
    case 'shape':
      paint(css, node.fills, node.stroke, node.shadows, styles, url)
      css.borderRadius = node.shape === 'ellipse' ? '50%' : radiusCss(node.radius)
      break
    case 'image':
      paint(css, [], node.stroke, node.shadows, styles)
      css.borderRadius = radiusCss(node.radius)
      css.objectFit = node.fit
      css.display = 'block'
      break
    case 'icon':
      // Le tracé (SVG en currentColor) prend la couleur de sa boîte.
      css.color = resolveColor(node.color, styles)
      css.display = 'block'
      break
    case 'text': {
      const ts = node.textStyle ? styles.text.find((s) => s.id === node.textStyle) : undefined
      const f = ts ?? node
      Object.assign(css, {
        fontFamily: `"${f.fontFamily}"`,
        fontWeight: f.fontWeight,
        fontStyle: f.fontStyle,
        fontSize: px(f.fontSize),
        lineHeight: px(f.lineHeight),
        letterSpacing: px(f.letterSpacing),
        fontOpticalSizing: 'auto',
        textAlign: node.textAlign,
        color: resolveColor(node.color, styles),
        whiteSpace: node.textSizing === 'auto' ? 'pre' : 'pre-wrap',
        margin: 0,
      })
      if (node.textSizing !== 'auto') css.overflowWrap = 'break-word'
      break
    }
  }

  if ('blur' in node && node.blur) css.filter = [css.filter, `blur(${px(node.blur)})`].filter(Boolean).join(' ')
  if ('backgroundBlur' in node && node.backgroundBlur) css.backdropFilter = `blur(${px(node.backgroundBlur)})`

  if (!node.visible) css.display = 'none'
  return css
}

/**
 * Contour `inside` ou `center` d'un cadre, dessiné par une couche posée au-dessus de ses enfants
 * (sinon un enfant opaque le recouvrirait). `null` si le cadre n'a pas de tel contour.
 */
export function frameStrokeCss(node: FrameNode, styles: DocStyles): CSS | null {
  const stroke = node.stroke
  if (!stroke || stroke.align === 'outside') return null
  const css: CSS = {
    position: 'absolute', inset: 0, borderRadius: radiusCss(node.radius), pointerEvents: 'none', zIndex: 2147483647,
  }
  const c = resolveColor(stroke.color, styles)
  if (stroke.align === 'inside') css.boxShadow = `inset 0 0 0 ${px(stroke.width)} ${c}`
  else {
    css.outline = `${px(stroke.width)} solid ${c}`
    css.outlineOffset = px(-stroke.width / 2)
  }
  return css
}

/** Image sans fichier choisi : un gris neutre, pour que le remplissage reste visible. */
const EMPTY_IMAGE = 'linear-gradient(#E5E5E5, #E5E5E5)'
const IMAGE_SIZE = { cover: 'cover', contain: 'contain', fill: '100% 100%' } as const

/**
 * Fond CSS d'une pile de remplissages (le dernier est au-dessus, comme dans Figma). Une image est
 * une couche centrée, sans répétition, à la taille de son `fit`.
 */
export function fillsCss(fills: Fill[], styles: DocStyles, url: AssetUrl = sameUrl): CSS {
  const color = (c: Color) => resolveColor(c, styles)
  if (fills.length === 1 && !isGradient(fills[0]!) && !isImageFill(fills[0]!)) return { backgroundColor: color(fills[0] as Color) }
  if (fills.length === 0) return {}
  const top = [...fills].reverse()
  const layers = top.map((f) => {
    if (isImageFill(f)) return f.src ? `url("${url(f.src).replace(/["\\]/g, '\\$&')}")` : EMPTY_IMAGE
    return isGradient(f) ? gradientCss(f, color) : `linear-gradient(${color(f)}, ${color(f)})`
  })
  const css: CSS = { backgroundImage: layers.join(', ') }
  if (top.some(isImageFill)) {
    css.backgroundSize = top.map((f) => (isImageFill(f) && f.src ? IMAGE_SIZE[f.fit] : 'auto')).join(', ')
    css.backgroundPosition = top.map(() => 'center').join(', ')
    css.backgroundRepeat = top.map(() => 'no-repeat').join(', ')
  }
  return css
}

function paint(css: CSS, fills: Fill[], stroke: Stroke | undefined, shadows: Shadow[], styles: DocStyles, url: AssetUrl = sameUrl): void {
  Object.assign(css, fillsCss(fills, styles, url))

  const layers: string[] = []
  if (stroke) {
    const c = resolveColor(stroke.color, styles)
    if (stroke.align === 'inside') layers.push(`inset 0 0 0 ${px(stroke.width)} ${c}`)
    else if (stroke.align === 'outside') layers.push(`0 0 0 ${px(stroke.width)} ${c}`)
    else {
      css.outline = `${px(stroke.width)} solid ${c}`
      css.outlineOffset = px(-stroke.width / 2)
    }
  }
  for (const s of shadows) layers.push(shadowCss(s, styles))
  if (layers.length) css.boxShadow = layers.join(', ')
}
