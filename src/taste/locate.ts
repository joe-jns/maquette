// Où épingler une faute de taste-skill : l'élément dont le texte est cité dans le message, sinon le cadre.
// Code pur.
import { findNode } from '../core/tree'
import type { MaquetteDocument, Node } from '../core/types'

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Textes cités entre guillemets droits dans un message (`"Un titre…"` → `un titre`). */
export function quotes(message: string): string[] {
  return [...message.matchAll(/"([^"]{3,})"/g)].map((m) => normalize(m[1]!.replace(/…$/, '')))
}

/** Identifiant de l'élément concerné par la faute, dans le cadre contrôlé ; le cadre lui-même à défaut. */
export function locateFinding(doc: MaquetteDocument, frameId: string, message: string): string {
  const frame = findNode(doc, frameId)?.node
  if (!frame) return frameId
  const wanted = quotes(message)
  if (!wanted.length) return frameId
  const texts: Node[] = []
  const visit = (n: Node) => {
    if (n.type === 'text' && n.visible) texts.push(n)
    if (n.type === 'frame') n.children.forEach(visit)
  }
  visit(frame)
  for (const q of wanted) {
    const hit = texts.find((t) => t.type === 'text' && normalize(t.content).startsWith(q))
    if (hit) return hit.id
  }
  return frameId
}
