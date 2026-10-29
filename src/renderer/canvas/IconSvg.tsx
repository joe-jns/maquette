import { createElement, memo } from 'react'
import NODES from 'lucide-static/icon-nodes.json'
import { FALLBACK_ICON } from '../../core/icons/lucide'
import { FALLBACK_ICONS } from '../../core/icons/sets'
import type { IconSet, IconWeight } from '../../core/types'
import { iconVariant, useIconPaths } from './iconPaths'

type IconElement = [string, Record<string, string>]
const ICONS = NODES as unknown as Record<string, IconElement[]>

/** Grille de chaque jeu : Lucide et Feather au trait sur 24, Phosphor en aplats sur 256, Material sur 960. */
const VIEW_BOX: Record<IconSet, string> = {
  lucide: '0 0 24 24',
  feather: '0 0 24 24',
  phosphor: '0 0 256 256',
  'material-rounded': '0 -960 960 960',
}

interface Props {
  name: string
  set?: IconSet
  weight?: IconWeight
  filled?: boolean
  /** Lucide et Feather seulement : les autres jeux sont des aplats. */
  strokeWidth?: number
  size?: number
}

/**
 * Tracé d'une icône en SVG inline (en `currentColor`), à la taille de sa boîte. Un nom inconnu dessine
 * l'icône de repli du jeu. Phosphor, Feather et Material : tracés chargés au premier usage, l'icône
 * reste vide le temps du chargement.
 */
export const IconSvg = memo(function IconSvg({ name, set = 'lucide', weight, filled, strokeWidth = 2, size }: Props) {
  const variant = iconVariant(set, weight, filled)
  const paths = useIconPaths(variant)
  const stroked = set === 'lucide' || set === 'feather'
  const box = {
    viewBox: VIEW_BOX[set],
    width: size ?? '100%',
    height: size ?? '100%',
    'aria-hidden': true,
    focusable: 'false' as const,
    style: { display: 'block', overflow: 'visible' },
    ...(stroked
      ? { fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
      : { fill: 'currentColor' }),
  }
  if (set === 'lucide') {
    const elements = ICONS[name] ?? ICONS[FALLBACK_ICON] ?? []
    return <svg {...box}>{elements.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}</svg>
  }
  const drawing = paths ? (paths[name] ?? paths[FALLBACK_ICONS[set]] ?? '') : ''
  // Un tracé seul est un « d » ; sinon le contenu SVG de l'icône, lu dans les paquets à la compilation.
  if (drawing.startsWith('<')) return <svg {...box} dangerouslySetInnerHTML={{ __html: drawing }} />
  return <svg {...box}>{drawing && <path d={drawing} />}</svg>
})
