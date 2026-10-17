// Réglages de Maquette autour des règles de taste-skill. Code pur.
import type { FrameNode, Node, TextNode } from '../core/types'

/** Règles pensées pour un site vivant (vidéo, défilement) : sans objet sur une maquette fixe. */
export const STATIC_ALLOW = ['still-page', 'no-footage', 'long-pin', 'pinned-over-picture', 'empty-screens', 'side-scroll']

/** Règles qui n'ont de sens que pour une page entière (premier écran, nombre d'images…). */
export const PAGE_RULES = ['no-hero', 'first-action', 'focal-point', 'hero-words', 'few-pictures', 'no-real-pictures', 'font-count', 'size-count']

/**
 * Règles des pages publiques sans objet sur un écran d'application (tableau de bord, mobile) : en-têtes
 * de colonnes, filets de tableau, cartes répétées, chiffres alignés y sont des conventions, pas des tics.
 * Restent : contraste, tailles de texte, polices, dégradés, ombres, débordements.
 */
export const APP_ALLOW = [
  'eyebrow', 'micro-label', 'mono', 'numbering', 'hairline', 'outlined-box', 'dashed', 'card-rows', 'icon-cards',
  'first-action', 'few-pictures', 'no-real-pictures', 'no-hero', 'focal-point', 'hero-words', 'headline-lines', 'all-centred',
]

/**
 * Cadres qui se lisent comme des boutons. Une maquette n'a pas de <button> : la sonde de taste-skill ne
 * voyait aucun bouton (règle first-action, toujours en alerte). Un cadre rempli ou bordé, en disposition
 * auto, qui ne contient qu'un libellé court (et au plus une icône) est marqué role="button" avant la sonde.
 */
export function buttonLikeIds(root: Node): string[] {
  const out: string[] = []
  const visit = (node: Node): void => {
    if (node.type !== 'frame') return
    if (isButtonLike(node)) out.push(node.id)
    else node.children.forEach(visit)
  }
  visit(root)
  return out
}

function isButtonLike(node: FrameNode): boolean {
  if (node.layout.mode !== 'auto' || !node.visible) return false
  const painted = node.fills.length > 0 || (node.stroke !== undefined && node.stroke.width >= 1)
  if (!painted) return false
  if (typeof node.height === 'number' && (node.height < 28 || node.height > 84)) return false
  const texts = node.children.filter((c): c is TextNode => c.type === 'text')
  const others = node.children.filter((c) => c.type !== 'text')
  if (texts.length !== 1 || others.length > 1 || others.some((c) => c.type !== 'icon')) return false
  const label = texts[0]!.content.trim()
  return label.length > 0 && label.length <= 40 && !label.includes('\n')
}
