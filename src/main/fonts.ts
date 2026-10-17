import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FontInfo } from '../shared/ipc'
import { writeFileAtomic } from './files'

export type { FontInfo }

export type FetchText = (url: string) => Promise<string>
export type FetchBytes = (url: string) => Promise<Uint8Array>

export const CATALOG_URL = 'https://fonts.google.com/metadata/fonts'
const CSS2_URL = 'https://fonts.googleapis.com/css2'
const CATALOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** Catalogue affiché quand rien n'est en cache et que le réseau ne répond pas. */
export const FALLBACK_FONTS: FontInfo[] = [
  { family: 'Inter', category: 'Sans Serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true, variable: { min: 100, max: 900 } },
  { family: 'Arial', category: 'Sans Serif', weights: [400, 700], italic: true, variable: null },
  { family: 'Georgia', category: 'Serif', weights: [400, 700], italic: true, variable: null },
  { family: 'Times New Roman', category: 'Serif', weights: [400, 700], italic: true, variable: null },
  { family: 'Verdana', category: 'Sans Serif', weights: [400, 700], italic: true, variable: null },
  { family: 'Courier New', category: 'Monospace', weights: [400, 700], italic: true, variable: null },
  { family: 'system-ui', category: 'Sans Serif', weights: [400, 700], italic: false, variable: null },
]

interface RawFamily {
  family?: unknown
  category?: unknown
  fonts?: Record<string, unknown>
  axes?: { tag?: unknown; min?: unknown; max?: unknown }[]
}

/** Lit le JSON de fonts.google.com (qui commence par un préfixe anti-JSON-hijacking). */
export function parseCatalog(text: string): FontInfo[] {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('Catalogue des polices illisible')
  const data = JSON.parse(text.slice(start)) as { familyMetadataList?: RawFamily[] }
  const list: FontInfo[] = []
  for (const raw of data.familyMetadataList ?? []) {
    if (typeof raw.family !== 'string' || !raw.family) continue
    const keys = Object.keys(raw.fonts ?? {})
    const weights = [...new Set(keys.map((k) => parseInt(k, 10)).filter((w) => Number.isFinite(w)))].sort((a, b) => a - b)
    const axis = (raw.axes ?? []).find((a) => a.tag === 'wght')
    const variable =
      axis && typeof axis.min === 'number' && typeof axis.max === 'number' ? { min: axis.min, max: axis.max } : null
    list.push({
      family: raw.family,
      category: typeof raw.category === 'string' ? raw.category : '',
      weights,
      italic: keys.some((k) => k.endsWith('i')),
      variable,
    })
  }
  return list
}

/** Adresse de la feuille css2 couvrant toutes les graisses (et l'italique) de la famille. */
export function css2Url(info: FontInfo, opts: { italic?: boolean } = {}): string {
  const family = info.family.split(' ').map(encodeURIComponent).join('+')
  const italic = opts.italic ?? info.italic
  let spec: string
  if (info.variable) {
    const range = `${info.variable.min}..${info.variable.max}`
    spec = italic ? `ital,wght@0,${range};1,${range}` : `wght@${range}`
  } else if (italic) {
    spec = `ital,wght@${[...info.weights.map((w) => `0,${w}`), ...info.weights.map((w) => `1,${w}`)].join(';')}`
  } else {
    spec = `wght@${info.weights.join(';')}`
  }
  return `${CSS2_URL}?family=${family}:${spec}&display=swap`
}

const FONT_URL =
  /url\((['"]?)((?:https:)?\/\/(?:fonts\.gstatic\.com|cdn\.fontshare\.com)\/[^)'"\s]+)\1\)/g
/** Sources de repli (woff, ttf, otf) qui suivent le woff2 dans une même règle src. */
const FALLBACK_SRC =
  /,\s*url\((['"]?)(?:https:)?\/\/(?:fonts\.gstatic\.com|cdn\.fontshare\.com)\/[^)'"\s]+\1\)\s*format\((['"]?)(?:woff|truetype|opentype)\2\)/g

/**
 * Remplace chaque url(https://fonts.gstatic.com/…) ou url(//cdn.fontshare.com/…) par url(mfont://<nom>) ;
 * les sources de repli non woff2 (Fontshare en ajoute) sont retirées. Renvoie les adresses d'origine, en https.
 */
export function rewriteCss(css: string, name: (url: string) => string): { css: string; urls: string[] } {
  const urls: string[] = []
  const out = css.replace(FALLBACK_SRC, '').replace(FONT_URL, (_m, _q, raw: string) => {
    const url = raw.startsWith('//') ? `https:${raw}` : raw
    if (!urls.includes(url)) urls.push(url)
    return `url(mfont://${name(url)})`
  })
  return { css: out, urls }
}

/** Police Fontshare connue (tirée de la bibliothèque de taste-skill). */
export interface FontshareFamily {
  family: string
  slug: string
  weights: number[]
}

const FONTSHARE_CSS_URL = 'https://api.fontshare.com/v2/css'

/** Adresse de la feuille Fontshare couvrant les graisses de la famille. */
export function fontshareUrl(font: FontshareFamily): string {
  return `${FONTSHARE_CSS_URL}?f[]=${encodeURIComponent(font.slug)}@${font.weights.join(',')}&display=swap`
}

/** Familles Fontshare de library/type.json (display et text), dédoublonnées, graisses fusionnées. */
export function fontshareFromTaste(typeJsonText: string): FontshareFamily[] {
  const data = JSON.parse(typeJsonText) as unknown
  const byFamily = new Map<string, FontshareFamily>()
  for (const system of Array.isArray(data) ? data : []) {
    for (const key of ['display', 'text']) {
      const face = (system as Record<string, unknown> | null)?.[key] as
        | { family?: unknown; source?: unknown; slug?: unknown; weights?: unknown }
        | undefined
      if (!face || face.source !== 'fontshare') continue
      if (typeof face.family !== 'string' || !face.family || typeof face.slug !== 'string' || !face.slug) continue
      const weights = Array.isArray(face.weights)
        ? face.weights.filter((w): w is number => typeof w === 'number' && Number.isFinite(w))
        : []
      const entry = byFamily.get(face.family) ?? { family: face.family, slug: face.slug, weights: [] }
      entry.weights = [...new Set([...entry.weights, ...weights])].sort((a, b) => a - b)
      byFamily.set(face.family, entry)
    }
  }
  return [...byFamily.values()].filter((f) => f.weights.length > 0)
}

const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`)
  return res
}

/** Téléchargement texte par défaut (en-tête navigateur : Google sert alors du woff2). */
export const fetchText: FetchText = async (url) => (await get(url)).text()

/** Téléchargement binaire par défaut. */
export const fetchBytes: FetchBytes = async (url) => new Uint8Array(await (await get(url)).arrayBuffer())

/** Même principe que writeFileAtomic, pour des octets. */
async function writeBytesAtomic(target: string, bytes: Uint8Array): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now().toString(36)}`
  try {
    await writeFile(tmp, bytes)
    await rename(tmp, target)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

const exists = (path: string) => access(path).then(() => true, () => false)

interface CatalogFile {
  savedAt: number
  fonts: FontInfo[]
}

/**
 * Cache local des polices Google : catalogue dans dir/catalog.json, feuilles dans dir/css/,
 * fichiers woff2 dans dir/files/ (servis par mfont://). Hors connexion, le cache suffit.
 * Les familles Fontshare passées en option complètent le catalogue quand Google ne les a pas.
 */
export class FontCache {
  private catalogPromise: Promise<FontInfo[]> | null = null
  private googlePromise: Promise<FontInfo[]> | null = null
  private readonly cssPromises = new Map<string, Promise<string | null>>()

  constructor(
    private readonly dir: string,
    private readonly fetchText: FetchText,
    private readonly fetchBytes: FetchBytes,
    private readonly now: () => number = Date.now,
    private readonly fontshare: FontshareFamily[] = [],
  ) {}

  /** Catalogue Google (ou de secours), complété des familles Fontshare absentes de celui-ci. */
  catalog(): Promise<FontInfo[]> {
    this.catalogPromise ??= this.googleCatalog().then((google) => {
      const known = new Set(google.map((f) => f.family))
      const extra: FontInfo[] = this.fontshare
        .filter((f) => !known.has(f.family))
        .map((f) => ({ family: f.family, category: 'Fontshare', weights: [...f.weights], italic: false, variable: null }))
      return extra.length ? [...google, ...extra] : google
    })
    return this.catalogPromise
  }

  private googleCatalog(): Promise<FontInfo[]> {
    this.googlePromise ??= this.loadCatalog()
    return this.googlePromise
  }

  css(family: string): Promise<string | null> {
    let pending = this.cssPromises.get(family)
    if (!pending) {
      pending = this.loadCss(family).finally(() => this.cssPromises.delete(family))
      this.cssPromises.set(family, pending)
    }
    return pending
  }

  private async readCachedCatalog(): Promise<CatalogFile | null> {
    try {
      const data = JSON.parse(await readFile(join(this.dir, 'catalog.json'), 'utf8')) as CatalogFile
      return typeof data.savedAt === 'number' && Array.isArray(data.fonts) ? data : null
    } catch {
      return null
    }
  }

  private async loadCatalog(): Promise<FontInfo[]> {
    const cached = await this.readCachedCatalog()
    if (cached && this.now() - cached.savedAt < CATALOG_MAX_AGE_MS) return cached.fonts
    try {
      const fonts = parseCatalog(await this.fetchText(CATALOG_URL))
      if (fonts.length === 0) throw new Error('Catalogue des polices vide')
      await mkdir(this.dir, { recursive: true })
      const file: CatalogFile = { savedAt: this.now(), fonts }
      await writeFileAtomic(join(this.dir, 'catalog.json'), JSON.stringify(file))
      return fonts
    } catch {
      return cached?.fonts ?? FALLBACK_FONTS
    }
  }

  private async loadCss(family: string): Promise<string | null> {
    const cssFile = join(this.dir, 'css', `${sha16(family)}.css`)
    try {
      return await readFile(cssFile, 'utf8')
    } catch {
      // Pas encore en cache : on télécharge.
    }
    const info = (await this.googleCatalog()).find((f) => f.family === family)
    const shared = info ? undefined : this.fontshare.find((f) => f.family === family)
    if (!info && !shared) return null
    try {
      let sheet: string
      if (shared) {
        sheet = await this.fetchText(fontshareUrl(shared))
      } else if (info) {
        try {
          sheet = await this.fetchText(css2Url(info))
        } catch (e) {
          // Statique : toutes les graisses n'existent pas forcément en italique ; on retente sans.
          if (!info.italic || info.variable) throw e
          sheet = await this.fetchText(css2Url(info, { italic: false }))
        }
      } else {
        return null
      }
      const { css, urls } = rewriteCss(sheet, (url) => `${sha16(url)}.woff2`)
      const filesDir = join(this.dir, 'files')
      await mkdir(filesDir, { recursive: true })
      for (const url of urls) {
        const target = join(filesDir, `${sha16(url)}.woff2`)
        if (await exists(target)) continue
        await writeBytesAtomic(target, await this.fetchBytes(url))
      }
      // La feuille n'est écrite qu'une fois tous ses fichiers présents.
      await mkdir(join(this.dir, 'css'), { recursive: true })
      await writeFileAtomic(cssFile, css)
      return css
    } catch {
      return null
    }
  }
}
