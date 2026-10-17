import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { creditLine, isSafe, licenceLabel, licenceUrl, safeFileName, type FoundImage } from './imageSources'

/**
 * Crédits des photos posées par l'outil `images` : `assets/credits.json` à côté du document, au même
 * format que celui de taste-skill (`assets.mjs --credits --to assets` sait le lire). Une entrée par
 * fichier ; `file` est relatif au dossier du document (« assets/… »), comme le `src` des images.
 */
export interface CreditEntry {
  file: string
  media: 'image'
  ref: string
  title: string
  creator: string | null
  creatorUrl: null
  date: null
  license: string
  licenseCode: string
  licenseUrl: string | null
  creditRequired: boolean
  page: string | null
  via: string
  image: string
  width: number
  height: number
  bytes: number
  credit: string
  notes: string[]
  saved: string
}

const creditsPath = (docDir: string) => join(docDir, 'assets', 'credits.json')

export async function readCredits(docDir: string): Promise<CreditEntry[]> {
  try {
    const list: unknown = JSON.parse(await readFile(creditsPath(docDir), 'utf8'))
    return Array.isArray(list) ? list.filter((c): c is CreditEntry => typeof c === 'object' && c !== null && typeof (c as CreditEntry).file === 'string') : []
  } catch {
    return []
  }
}

/** Ajoute (ou remplace, même fichier) une entrée ; écriture par fichier temporaire puis renommage. */
async function recordCredit(docDir: string, entry: CreditEntry): Promise<void> {
  const list = (await readCredits(docDir)).filter((c) => c.file !== entry.file)
  const target = creditsPath(docDir)
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify([...list, entry], null, 1), 'utf8')
  await rename(tmp, target)
}

function notes(it: FoundImage): string[] {
  const n: string[] = []
  if (it.licence.endsWith('-sa')) n.push('Partage à l’identique : une version modifiée se partage sous la même licence.')
  if (it.licenceName === 'aucune restriction de droits connue') n.push('Pas une licence formelle : l’archive déclare ne connaître aucune restriction de droits.')
  return n
}

/**
 * Enregistre une photo téléchargée dans `assets/` (nom tiré du titre et de l'empreinte : la même
 * photo posée deux fois ne fait qu'un fichier) et note son crédit. Renvoie le `src` du nœud image.
 */
export async function saveFound(
  docDir: string,
  it: FoundImage,
  file: { bytes: Uint8Array; ext: string; width: number; height: number },
): Promise<{ src: string; entry: CreditEntry }> {
  if (!isSafe(it)) throw new Error(`licence ${licenceLabel(it)} : non utilisable pour un client`)
  const hash = createHash('sha256').update(file.bytes).digest('hex')
  const name = safeFileName(it.title, it.ref, hash, file.ext)
  await mkdir(join(docDir, 'assets'), { recursive: true })
  try {
    await writeFile(join(docDir, 'assets', name), file.bytes, { flag: 'wx' })
  } catch (e) {
    // Déjà présente : même nom, même empreinte, même contenu.
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  const src = `assets/${name}`
  const entry: CreditEntry = {
    file: src, media: 'image', ref: it.ref, title: it.title, creator: it.creator || null, creatorUrl: null, date: null,
    license: licenceLabel(it), licenseCode: it.licence, licenseUrl: licenceUrl(it), creditRequired: it.licence !== 'cc0' && it.licence !== 'pd',
    page: it.page, via: it.via, image: it.image, width: file.width, height: file.height, bytes: file.bytes.byteLength,
    credit: creditLine(it), notes: notes(it), saved: new Date().toISOString(),
  }
  await recordCredit(docDir, entry)
  return { src, entry }
}
