import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createNode } from '../core/defaults'
import type { MaquetteDocument, Node } from '../core/types'

/** Largeur visée des aperçus de l'accueil (px). */
export const THUMB_WIDTH = 640

/** Empreinte (SHA-1, 40 hex) d'un chemin : nom de son aperçu. « C:\A » et « c:\a » sont le même fichier sous Windows. */
export function thumbHash(path: string, platform: string = process.platform): string {
  const abs = resolve(path)
  return createHash('sha1').update(platform === 'win32' ? abs.toLowerCase() : abs).digest('hex')
}

const WRAP_ID = '__maquette_thumb__'
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/**
 * Ce qu'on rend pour l'aperçu : le premier cadre visible de premier niveau de la première page ;
 * sinon toute la page (ses éléments visibles posés dans un cadre transparent qui les englobe) ;
 * null si la page est vide.
 */
export function thumbnailTarget(doc: MaquetteDocument): { doc: MaquetteDocument; nodeId: string; designWidth: number } | null {
  const page = doc.pages?.[0]
  if (!page) return null
  const visible = (page.children ?? []).filter((n) => n.visible)
  const frame = visible.find((n) => n.type === 'frame')
  if (frame) return { doc, nodeId: frame.id, designWidth: num(frame.width, 0) }
  if (!visible.length) return null
  // Les tailles « contenu » ou « remplir » ne sont pas connues ici : 100 px suffit pour cadrer.
  const boxes = visible.map((n) => {
    const x = num(n.x, 0)
    const y = num(n.y, 0)
    return { x, y, r: x + num(n.width, 100), b: y + num(n.height, 100) }
  })
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const width = Math.max(1, Math.max(...boxes.map((b) => b.r)) - left)
  const height = Math.max(1, Math.max(...boxes.map((b) => b.b)) - top)
  const children = visible.map((n) => ({ ...n, x: num(n.x, 0) - left, y: num(n.y, 0) - top })) as Node[]
  const wrap = { ...createNode({ type: 'frame', name: 'Page', width, height, fills: [], clip: false }, WRAP_ID), children } as Node
  return { doc: { ...doc, pages: [{ ...page, children: [wrap] }, ...doc.pages.slice(1)] }, nodeId: WRAP_ID, designWidth: width }
}

/**
 * Hauteur gardée d'une image d'aperçu : le haut d'une longue page de bureau (format 16:10, comme un
 * écran), un écran de téléphone en entier (jusqu'à 2,2 fois sa largeur).
 */
export function thumbCropHeight(width: number, height: number, designWidth: number): number {
  const ratio = designWidth >= 1000 ? 10 / 16 : 2.2
  return Math.max(1, Math.min(height, Math.round(width * ratio)))
}
