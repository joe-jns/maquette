import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './files'

export interface FontInfo {
  family: string
  category: string
  weights: number[]
  italic: boolean
  variable: { min: number; max: number } | null
}

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

const GSTATIC_URL = /url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"\s]+)\1\)/g

/** Remplace chaque url(https://fonts.gstatic.com/…) par url(mfont://<nom>) ; renvoie les adresses d'origine. */
export function rewriteCss(css: string, name: (url: string) => string): { css: string; urls: string[] } {
  const urls: string[] = []
  const out = css.replace(GSTATIC_URL, (_m, _q, url: string) => {
    if (!urls.includes(url)) urls.push(url)
    return `url(mfont://${name(url)})`
  })
  return { css: out, urls }
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
 */
export class FontCache {
  private catalogPromise: Promise<FontInfo[]> | null = null
  private readonly cssPromises = new Map<string, Promise<string | null>>()

  constructor(
    private readonly dir: string,
    private readonly fetchText: FetchText,
    private readonly fetchBytes: FetchBytes,
    private readonly now: () => number = Date.now,
  ) {}

  catalog(): Promise<FontInfo[]> {
    this.catalogPromise ??= this.loadCatalog()
    return this.catalogPromise
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
    const info = (await this.catalog()).find((f) => f.family === family)
    if (!info) return null
    try {
      let sheet: string
      try {
        sheet = await this.fetchText(css2Url(info))
      } catch (e) {
        // Statique : toutes les graisses n'existent pas forcément en italique ; on retente sans.
        if (!info.italic || info.variable) throw e
        sheet = await this.fetchText(css2Url(info, { italic: false }))
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
