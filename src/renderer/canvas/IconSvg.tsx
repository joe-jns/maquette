import { createElement, memo } from 'react'
import NODES from 'lucide-static/icon-nodes.json'
import { FALLBACK_ICON } from '../../core/icons/lucide'

type IconElement = [string, Record<string, string>]
const ICONS = NODES as unknown as Record<string, IconElement[]>

/**
 * Tracé d'une icône Lucide en SVG inline (grille 24 × 24, trait en `currentColor`), à la taille de sa
 * boîte. Un nom inconnu dessine l'icône de repli.
 */
export const IconSvg = memo(function IconSvg({ name, strokeWidth = 2, size }: { name: string; strokeWidth?: number; size?: number }) {
  const elements = ICONS[name] ?? ICONS[FALLBACK_ICON] ?? []
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? '100%'}
      height={size ?? '100%'}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {elements.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
})
