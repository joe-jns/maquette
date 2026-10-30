import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { isVersionId, type VersionInfo } from '../shared/versions'
import { writeFileAtomic } from './files'
import { thumbHash } from './thumbModel'

/** Versions automatiques gardées par fichier ; les nommées ne sont jamais effacées d'office. */
export const MAX_AUTO = 50
const NAME_MAX = 120

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Untitled version'

function isInfo(v: unknown): v is VersionInfo {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return isVersionId(e.id) && typeof e.name === 'string' && typeof e.date === 'number' && typeof e.auto === 'boolean' && typeof e.size === 'number'
}

/**
 * Versions des fichiers : `<dossier>/<empreinte du chemin>/index.json` (la liste, de la plus ancienne à la
 * plus récente) et un `<id>.maquette` par version. L'empreinte est celle des aperçus (thumbHash).
 * Les opérations passent l'une après l'autre : l'index n'est jamais relu à moitié écrit.
 */
export class VersionStore {
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private readonly dir: string) {}

  private folder(path: string): string {
    return join(this.dir, thumbHash(path))
  }

  /** Une opération après l'autre ; une erreur n'empêche pas les suivantes. */
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  private async readIndex(folder: string): Promise<VersionInfo[]> {
    try {
      const raw: unknown = JSON.parse(await readFile(join(folder, 'index.json'), 'utf8'))
      return Array.isArray(raw) ? raw.filter(isInfo) : []
    } catch {
      return []
    }
  }

  private async writeIndex(folder: string, list: VersionInfo[]): Promise<void> {
    await mkdir(folder, { recursive: true })
    await writeFileAtomic(join(folder, 'index.json'), JSON.stringify(list, null, 2))
  }

  /** Au-delà de MAX_AUTO versions automatiques, les plus anciennes partent (fichiers compris). */
  private async prune(folder: string, list: VersionInfo[]): Promise<VersionInfo[]> {
    const autos = list.filter((v) => v.auto).sort((a, b) => a.date - b.date)
    const drop = new Set(autos.slice(0, Math.max(0, autos.length - MAX_AUTO)).map((v) => v.id))
    for (const id of drop) await rm(join(folder, `${id}.maquette`), { force: true })
    return list.filter((v) => !drop.has(v.id))
  }

  /** Versions d'un fichier, la plus récente d'abord. */
  list(path: string): Promise<VersionInfo[]> {
    return this.queue(async () => (await this.readIndex(this.folder(path))).sort((a, b) => b.date - a.date))
  }

  add(path: string, text: string, opts: { name: string; auto: boolean }, now = Date.now()): Promise<VersionInfo> {
    return this.queue(async () => {
      const folder = this.folder(path)
      const info: VersionInfo = {
        id: `${now.toString(36)}-${randomBytes(4).toString('hex')}`,
        name: cleanName(opts.name),
        date: now,
        auto: opts.auto,
        size: Buffer.byteLength(text, 'utf8'),
      }
      await mkdir(folder, { recursive: true })
      await writeFileAtomic(join(folder, `${info.id}.maquette`), text)
      const list = await this.prune(folder, [...(await this.readIndex(folder)), info])
      await this.writeIndex(folder, list)
      return info
    })
  }

  read(path: string, id: string): Promise<string | null> {
    if (!isVersionId(id)) return Promise.resolve(null)
    return this.queue(async () => {
      const folder = this.folder(path)
      if (!(await this.readIndex(folder)).some((v) => v.id === id)) return null
      return readFile(join(folder, `${id}.maquette`), 'utf8').catch(() => null)
    })
  }

  rename(path: string, id: string, name: string): Promise<boolean> {
    return this.queue(async () => {
      const folder = this.folder(path)
      const list = await this.readIndex(folder)
      const v = list.find((e) => e.id === id)
      if (!v) return false
      v.name = cleanName(name)
      await this.writeIndex(folder, list)
      return true
    })
  }

  remove(path: string, id: string): Promise<boolean> {
    return this.queue(async () => {
      const folder = this.folder(path)
      const list = await this.readIndex(folder)
      if (!list.some((v) => v.id === id)) return false
      await this.writeIndex(folder, list.filter((v) => v.id !== id))
      await rm(join(folder, `${id}.maquette`), { force: true })
      return true
    })
  }

  /**
   * « Enregistrer sous » : les versions de l'ancien chemin sont copiées vers le nouveau (ajoutées à celles
   * qu'il aurait déjà). L'ancien fichier garde les siennes.
   */
  copy(from: string, to: string): Promise<void> {
    return this.queue(async () => {
      const src = this.folder(from)
      const dst = this.folder(to)
      if (src === dst) return
      const theirs = await this.readIndex(src)
      if (!theirs.length) return
      const ours = await this.readIndex(dst)
      const known = new Set(ours.map((v) => v.id))
      await mkdir(dst, { recursive: true })
      const added: VersionInfo[] = []
      for (const v of theirs) {
        if (known.has(v.id)) continue
        try {
          await copyFile(join(src, `${v.id}.maquette`), join(dst, `${v.id}.maquette`))
          added.push(v)
        } catch {
          // Fichier de version disparu : on ne la reprend pas.
        }
      }
      const list = await this.prune(dst, [...ours, ...added].sort((a, b) => a.date - b.date))
      await this.writeIndex(dst, list)
    })
  }
}
