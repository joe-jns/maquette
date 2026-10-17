import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveAssetPath } from './assetPath'
import { mergeCredits, readCredits } from './imageCredits'

/**
 * Images d'un document jamais enregistré : elles attendent dans userData/pending-assets/<lancement>/assets,
 * sous le même `src` (« assets/… ») qu'elles auront à côté du fichier. Au premier enregistrement elles
 * sont recopiées dans le dossier du fichier : le document n'a pas à être réécrit, l'annulation reste intacte.
 */
export const PENDING_ROOT = 'pending-assets'

/** Les `src` « assets/… » cités par un document (texte .maquette), sans doublon. */
export function referencedAssets(text: string): string[] {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return []
  }
  const found = new Set<string>()
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) visit(x)
      return
    }
    if (typeof v !== 'object' || v === null) return
    for (const [k, x] of Object.entries(v)) {
      if (k === 'src' && typeof x === 'string' && x.startsWith('assets/')) found.add(x)
      else visit(x)
    }
  }
  visit(doc)
  return [...found]
}

const same = (a: string, b: string) =>
  process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

/**
 * Recopie dans `toDir` les images citées par le document qui sont dans `fromDir` (sans écraser :
 * un nom d'image est tiré de son contenu), avec leurs crédits. Renvoie les `src` recopiés.
 */
export async function carryAssets(fromDir: string, toDir: string, text: string): Promise<string[]> {
  if (same(fromDir, toDir)) return []
  const copied: string[] = []
  for (const src of referencedAssets(text)) {
    const from = resolveAssetPath(fromDir, src)
    const to = resolveAssetPath(toDir, src)
    if (!from || !to) continue
    try {
      await mkdir(dirname(to), { recursive: true })
      await copyFile(from, to, constants.COPYFILE_EXCL)
      copied.push(src)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EEXIST') copied.push(src)
      // ENOENT : image déjà absente de l'ancien dossier, rien à recopier.
      else if (code !== 'ENOENT') throw e
    }
  }
  if (copied.length) {
    const wanted = new Set(copied)
    await mergeCredits(toDir, (await readCredits(fromDir)).filter((c) => wanted.has(c.file)))
  }
  return copied
}

/** Recopie tout le dossier assets/ d'un dossier d'attente dans un autre (copie de secours restaurée). */
export async function adoptPending(fromDir: string, toDir: string): Promise<void> {
  if (same(fromDir, toDir)) return
  let names: string[]
  try {
    names = await readdir(join(fromDir, 'assets'))
  } catch {
    return
  }
  await mkdir(join(toDir, 'assets'), { recursive: true })
  for (const name of names) {
    if (name === 'credits.json') continue
    await copyFile(join(fromDir, 'assets', name), join(toDir, 'assets', name), constants.COPYFILE_EXCL).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'EEXIST') throw e
    })
  }
  await mergeCredits(toDir, await readCredits(fromDir))
}

/**
 * Retire les dossiers d'attente des lancements passés dont aucune copie de secours ne reste
 * (`keep(lancement)` faux) : leurs images ont été recopiées à l'enregistrement, ou abandonnées.
 */
export async function cleanPending(root: string, keep: (session: string) => boolean): Promise<void> {
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return
  }
  for (const name of names) {
    if (!keep(name)) await rm(join(root, name), { recursive: true, force: true }).catch(() => undefined)
  }
}
