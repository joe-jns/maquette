import { useId, type CSSProperties, type Ref } from 'react'
import { fillsCss, resolveColor } from '../../core/css'
import { isGradient } from '../../core/paint'
import type { Color, DocStyles, VectorNode } from '../../core/types'

/** Calque SVG qui remplit la boîte du vecteur, tracé étiré (viewBox sans respect des proportions). */
const LAYER: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', display: 'block' }

/** Masque CSS en forme du tracé (pour les dégradés, que le SVG ne sait pas peindre comme le CSS). */
function maskOf(node: VectorNode): CSSProperties {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${node.viewBox.join(' ')}" preserveAspectRatio="none">` +
    `<path d="${node.path}" fill-rule="${node.fillRule}"/></svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  return { maskImage: url, maskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskImage: url, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat' }
}

/**
 * Un calque vecteur : le tracé étiré dans sa boîte. Couleurs unies en `<path>` SVG ; s'il y a un
 * dégradé, toute la pile de remplissages passe par un fond CSS découpé à la forme du tracé (masque),
 * pour un rendu identique aux cadres (conique compris). Le contour, au-dessus, garde son épaisseur
 * en px (`vector-effect: non-scaling-stroke`) ; inside/outside : trait doublé, coupé dans ou hors du tracé.
 */
export function VectorView({ node, style, styles, nodeRef }: { node: VectorNode; style: CSSProperties; styles: DocStyles; nodeRef: Ref<HTMLDivElement> }) {
  const uid = `v${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const color = (c: Color) => resolveColor(c, styles)
  const viewBox = node.viewBox.join(' ')
  const gradient = node.fills.some(isGradient)
  const stroke = node.stroke
  const [vx, vy, vw, vh] = node.viewBox
  // Zone large autour du tracé pour le masque « outside » (le trait non mis à l'échelle peut déborder).
  const around = { x: vx - vw * 2, y: vy - vh * 2, width: vw * 5, height: vh * 5 }

  return (
    <div ref={nodeRef} data-node-id={node.id} data-vector style={style}>
      {gradient && <div aria-hidden data-vector-fill style={{ position: 'absolute', inset: 0, ...fillsCss(node.fills, styles), ...maskOf(node) }} />}
      <svg viewBox={viewBox} preserveAspectRatio="none" aria-hidden focusable="false" style={LAYER}>
        {!gradient && node.fills.map((f, i) => <path key={i} d={node.path} fillRule={node.fillRule} fill={color(f as Color)} />)}
        {stroke && (
          <>
            {stroke.align !== 'center' && (
              <defs>
                {stroke.align === 'inside' ? (
                  <clipPath id={uid}>
                    <path d={node.path} clipRule={node.fillRule} />
                  </clipPath>
                ) : (
                  <mask id={uid} maskUnits="userSpaceOnUse" {...around}>
                    <rect {...around} fill="#FFFFFF" />
                    <path d={node.path} fillRule={node.fillRule} fill="#000000" />
                  </mask>
                )}
              </defs>
            )}
            <path
              d={node.path}
              fill="none"
              stroke={color(stroke.color)}
              strokeWidth={stroke.align === 'center' ? stroke.width : stroke.width * 2}
              vectorEffect="non-scaling-stroke"
              clipPath={stroke.align === 'inside' ? `url(#${uid})` : undefined}
              mask={stroke.align === 'outside' ? `url(#${uid})` : undefined}
            />
          </>
        )}
      </svg>
    </div>
  )
}
