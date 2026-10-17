/**
 * Placement des infobulles et des menus. Module pur : ni React ni DOM, testé à part.
 * Toutes les valeurs sont en pixels de la fenêtre (clientX/clientY).
 */

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Size { width: number; height: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)))

export type TooltipSide = 'top' | 'bottom'

/**
 * Infobulle : centrée sur la cible, du côté demandé à `gap` px ; passe de l'autre côté si elle
 * sortirait de la fenêtre et qu'elle y tient. `arrowX` : position de la pointe dans l'infobulle.
 */
export function placeTooltip(
  target: Box,
  tip: Size,
  viewport: Size,
  prefer: TooltipSide = 'bottom',
  gap = 6,
  margin = 6,
): { left: number; top: number; side: TooltipSide; arrowX: number } {
  const above = target.top - gap - tip.height
  const below = target.bottom + gap
  const fitsAbove = above >= margin
  const fitsBelow = below + tip.height <= viewport.height - margin
  let side: TooltipSide = prefer
  if (prefer === 'bottom' && !fitsBelow && fitsAbove) side = 'top'
  if (prefer === 'top' && !fitsAbove && fitsBelow) side = 'bottom'
  const center = (target.left + target.right) / 2
  const left = Math.round(clamp(center - tip.width / 2, margin, viewport.width - margin - tip.width))
  const top = Math.round(side === 'top' ? above : below)
  const arrowX = Math.round(clamp(center - left, 8, tip.width - 8))
  return { left, top, side, arrowX }
}

/**
 * Menu ouvert à un point (clic droit) : en bas à droite du point ; retourné vers la gauche ou vers
 * le haut s'il déborde ; toujours gardé dans la fenêtre (marge `margin`).
 */
export function placeMenu(at: { x: number; y: number }, menu: Size, viewport: Size, margin = 8): { left: number; top: number } {
  let left = at.x
  let top = at.y
  if (left + menu.width > viewport.width - margin) left = at.x - menu.width
  if (top + menu.height > viewport.height - margin) top = at.y - menu.height
  return {
    left: Math.round(clamp(left, margin, viewport.width - margin - menu.width)),
    top: Math.round(clamp(top, margin, viewport.height - margin - menu.height)),
  }
}

/**
 * Sous-menu : collé à droite du menu parent, sa première rangée alignée sur la rangée qui l'ouvre
 * (`inset` = marge intérieure du menu) ; à gauche du parent s'il n'y a pas la place à droite.
 */
export function placeSubmenu(
  parent: Box,
  rowTop: number,
  menu: Size,
  viewport: Size,
  { gap = 2, inset = 8, margin = 8 } = {},
): { left: number; top: number; side: 'right' | 'left' } {
  let left = parent.right + gap
  let side: 'right' | 'left' = 'right'
  if (left + menu.width > viewport.width - margin) {
    const flipped = parent.left - gap - menu.width
    if (flipped >= margin) {
      left = flipped
      side = 'left'
    }
  }
  return {
    left: Math.round(clamp(left, margin, viewport.width - margin - menu.width)),
    top: Math.round(clamp(rowTop - inset, margin, viewport.height - margin - menu.height)),
    side,
  }
}
