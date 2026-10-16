import type { Axis, Color, DocStyles, FrameNode, Node, Radius, Shadow, Stroke } from './types'

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

/** Styles CSS d'un élément. `parent === null` : élément posé directement sur la page. */
export function nodeCss(node: Node, parent: FrameNode | null, styles: DocStyles, index = 0): CSS {
  const css: CSS = { boxSizing: 'border-box' }
  const parentAuto = parent?.layout.mode === 'auto' ? parent.layout : null
  const inFlow = parentAuto !== null && node.position === 'flow'

  if (inFlow) css.position = 'relative'
  else {
    css.position = 'absolute'
    css.left = px(node.x ?? 0)
    css.top = px(node.y ?? 0)
  }

  for (const axis of ['width', 'height'] as Axis[]) {
    const size = node[axis]
    const isMain = parentAuto !== null && inFlow && (parentAuto.direction === 'row') === (axis === 'width')
    if (typeof size === 'number') {
      css[axis] = px(size)
      if (isMain) css.flexShrink = 0
    } else if (size.mode === 'hug') {
      if (isMain) css.flex = '0 0 auto'
      else if (!inFlow) css[axis] = 'fit-content'
    } else if (isMain) {
      css.flex = '1 1 0'
      css[axis === 'width' ? 'minWidth' : 'minHeight'] = '0px'
    } else {
      css.alignSelf = 'stretch'
    }
  }
  if (node.minWidth !== undefined) css.minWidth = px(node.minWidth)
  if (node.maxWidth !== undefined) css.maxWidth = px(node.maxWidth)
  if (node.minHeight !== undefined) css.minHeight = px(node.minHeight)
  if (node.maxHeight !== undefined) css.maxHeight = px(node.maxHeight)
  if (node.alignSelf !== undefined) css.alignSelf = FLEX_ALIGN[node.alignSelf]
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
      paint(css, node.fills, node.stroke, node.shadows, styles)
      css.borderRadius = radiusCss(node.radius)
      break
    }
    case 'shape':
      paint(css, node.fills, node.stroke, node.shadows, styles)
      css.borderRadius = node.shape === 'ellipse' ? '50%' : radiusCss(node.radius)
      break
    case 'image':
      paint(css, [], node.stroke, node.shadows, styles)
      css.borderRadius = radiusCss(node.radius)
      css.objectFit = node.fit
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

  if (!node.visible) css.display = 'none'
  return css
}

function paint(css: CSS, fills: Color[], stroke: Stroke | undefined, shadows: Shadow[], styles: DocStyles): void {
  const colors = fills.map((c) => resolveColor(c, styles))
  if (colors.length === 1) css.backgroundColor = colors[0]!
  else if (colors.length > 1) css.backgroundImage = [...colors].reverse().map((c) => `linear-gradient(${c}, ${c})`).join(', ')

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
