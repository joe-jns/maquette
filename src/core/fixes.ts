import { isHug } from './tree'
import type { TextNode } from './types'

/**
 * Réaligne `textSizing` sur les tailles du texte, comme Figma quand on redimensionne :
 * largeur hug → « auto » (et hauteur hug) ; hauteur hug → « auto-height » ; sinon « fixed ».
 * Renvoie true si le texte a changé.
 */
export function alignTextSizing(t: TextNode): boolean {
  let changed = false
  if (isHug(t.width) && !isHug(t.height)) {
    t.height = { mode: 'hug' }
    changed = true
  }
  const target = isHug(t.width) ? 'auto' : isHug(t.height) ? 'auto-height' : 'fixed'
  if (t.textSizing !== target) {
    t.textSizing = target
    changed = true
  }
  return changed
}
