import { parseClipboard, type ClipboardPayload } from './clipboard'

/**
 * Collage et dépôt d'images, en code pur : que coller (éléments Maquette, image, adresses d'images)
 * et comment disposer plusieurs images d'un coup.
 */

export interface ClipboardRead { text: string; html: string; image: boolean }

export type PasteChoice =
  | { kind: 'nodes'; payload: ClipboardPayload }
  | { kind: 'image' }
  | { kind: 'urls'; urls: string[] }
  | { kind: 'none' }

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif|svg)$/i
const IMAGE_FORMAT = /^(png|jpe?g|gif|webp|avif)$/i

/** Une adresse qui désigne une image (extension, `format=` de Twitter/X, ou data:image). */
export function looksLikeImageUrl(raw: string): boolean {
  const s = raw.trim()
  if (/^data:image\//i.test(s)) return true
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return IMAGE_PATH.test(url.pathname) || IMAGE_FORMAT.test(url.searchParams.get('format') ?? '')
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Plus grande variante d'un `srcset` (descripteurs « 800w » ou « 2x »), ou null. */
function largestOfSrcset(srcset: string): string | null {
  let best: { url: string; size: number } | null = null
  for (const part of srcset.split(/,\s+/)) {
    const [url, descriptor = '1x'] = part.trim().split(/\s+/)
    if (!url) continue
    const size = parseFloat(descriptor) * (descriptor.endsWith('x') ? 1000 : 1)
    if (!best || size > best.size) best = { url, size: Number.isFinite(size) ? size : 0 }
  }
  return best?.url ?? null
}

/** Twitter/X sert des vignettes (`name=small`) : on demande la grande version. */
function upgrade(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'pbs.twimg.com' && u.searchParams.has('name')) {
      u.searchParams.set('name', 'large')
      return u.toString()
    }
  } catch {
    // data: ou adresse relative : telle quelle.
  }
  return url
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null
}

/** Adresses des images d'un fragment HTML (presse-papiers, glisser depuis une page), sans doublon. */
export function imageUrlsFromHtml(html: string): string[] {
  const out: string[] = []
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const srcset = attr(tag, 'srcset')
    const src = (srcset && largestOfSrcset(srcset)) || attr(tag, 'src')
    if (!src) continue
    if (!/^(https?:|data:image\/)/i.test(src)) continue
    const url = upgrade(src)
    if (!out.includes(url)) out.push(url)
  }
  return out
}

/** Adresses d'images d'une liste `text/uri-list` (commentaires « # » ignorés). */
export function imageUrlsFromUriList(list: string): string[] {
  const urls = list.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  return [...new Set(urls.filter(looksLikeImageUrl).map(upgrade))]
}

/** Ce qu'un glisser depuis un navigateur apporte : les images du HTML d'abord (un lien autour d'une image pointe sur la page). */
export function droppedImageUrls(html: string, uriList: string): string[] {
  const fromHtml = imageUrlsFromHtml(html)
  return fromHtml.length ? fromHtml : imageUrlsFromUriList(uriList)
}

/**
 * Que coller ? Des éléments Maquette copiés passent en premier ; puis une image (capture, « Copier
 * l'image ») ; puis les images d'un HTML ou une adresse d'image ; enfin, presse-papiers du système
 * vide ou illisible, la copie interne de Maquette.
 */
export function choosePaste(system: ClipboardRead | null, internal: string): PasteChoice {
  if (system) {
    const nodes = system.text ? parseClipboard(system.text) : null
    if (nodes) return { kind: 'nodes', payload: nodes }
    if (system.image) return { kind: 'image' }
    const fromHtml = system.html ? imageUrlsFromHtml(system.html) : []
    if (fromHtml.length) return { kind: 'urls', urls: fromHtml }
    const text = system.text.trim()
    if (text && !/\s/.test(text) && looksLikeImageUrl(text)) return { kind: 'urls', urls: [upgrade(text)] }
    if (text || system.html) return { kind: 'none' }
  }
  const nodes = internal ? parseClipboard(internal) : null
  return nodes ? { kind: 'nodes', payload: nodes } : { kind: 'none' }
}

/** Largeur maximale d'une image importée : une capture 4K reste lisible sans écraser le canevas. */
export const MAX_IMPORT_WIDTH = 800

/** Taille d'affichage d'une image importée (réduite à 800 px de large, proportions gardées). */
export function importSize(natural: { width: number; height: number }): { width: number; height: number } {
  const scale = natural.width > MAX_IMPORT_WIDTH ? MAX_IMPORT_WIDTH / natural.width : 1
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) }
}

export const GRID_GAP = 40

/**
 * Grille de plusieurs images : ⌈√n⌉ colonnes, chaque colonne aussi large que sa plus large image,
 * chaque rangée aussi haute que sa plus haute ; positions relatives au coin haut-gauche, et taille totale.
 */
export function gridLayout(
  sizes: readonly { width: number; height: number }[],
  gap = GRID_GAP,
): { positions: { x: number; y: number }[]; width: number; height: number } {
  if (!sizes.length) return { positions: [], width: 0, height: 0 }
  const cols = Math.ceil(Math.sqrt(sizes.length))
  const rows = Math.ceil(sizes.length / cols)
  const colWidth = Array.from({ length: cols }, (_, c) => Math.max(0, ...sizes.filter((_, i) => i % cols === c).map((s) => s.width)))
  const rowHeight = Array.from({ length: rows }, (_, r) => Math.max(0, ...sizes.slice(r * cols, r * cols + cols).map((s) => s.height)))
  const xs = colWidth.map((_, c) => colWidth.slice(0, c).reduce((a, w) => a + w + gap, 0))
  const ys = rowHeight.map((_, r) => rowHeight.slice(0, r).reduce((a, h) => a + h + gap, 0))
  return {
    positions: sizes.map((_, i) => ({ x: xs[i % cols]!, y: ys[Math.floor(i / cols)]! })),
    width: xs[cols - 1]! + colWidth[cols - 1]!,
    height: ys[rows - 1]! + rowHeight[rows - 1]!,
  }
}
