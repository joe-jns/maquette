import * as nodeFs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { writeFileAtomic, type FsLike } from './files'

/** Ce dont les copies de secours ont besoin du disque (remplaçable dans les tests). */
export interface BackupFs extends FsLike {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readdir(path: string): Promise<string[]>
  mkdir(path: string, opts: { recursive: true }): Promise<unknown>
}

/** Un document : son chemin s'il a été enregistré, sinon la session (lancement) qui l'a créé. */
export interface BackupKey {
  path: string | null
  session: string
}

export interface PendingBackup {
  id: string
  path: string | null
  savedAt: number
  text: string
}

interface BackupMeta {
  path: string | null
  savedAt: number
}

/** Même document = même id ; sous Windows la casse du chemin ne compte pas. */
export function backupId(key: BackupKey): string {
  if (key.path === null) return `sans-titre-${key.session.replace(/[^\w-]/g, '_')}`
  const p = process.platform === 'win32' ? resolve(key.path).toLowerCase() : resolve(key.path)
  return createHash('sha256').update(p).digest('hex').slice(0, 16)
}

function isMeta(v: unknown): v is BackupMeta {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  return (m.path === null || typeof m.path === 'string') && typeof m.savedAt === 'number' && Number.isFinite(m.savedAt)
}

/**
 * Copies de secours, une par document : `<id>.maquette` (le texte) et `<id>.json` (d'où il vient,
 * quand). Le fichier de l'utilisateur n'est jamais touché ici.
 */
export class BackupStore {
  private readonly fs: BackupFs

  constructor(
    private readonly dir: string,
    fs?: BackupFs,
  ) {
    this.fs = fs ?? (nodeFs as unknown as BackupFs)
  }

  async write(key: BackupKey, text: string, now: number = Date.now()): Promise<void> {
    const id = backupId(key)
    await this.fs.mkdir(this.dir, { recursive: true })
    // Le texte d'abord : un json présent garantit un texte complet à côté.
    await writeFileAtomic(join(this.dir, `${id}.maquette`), text, { fs: this.fs })
    const meta: BackupMeta = { path: key.path, savedAt: now }
    await writeFileAtomic(join(this.dir, `${id}.json`), JSON.stringify(meta), { fs: this.fs })
  }

  clear(key: BackupKey): Promise<void> {
    return this.discard(backupId(key))
  }

  async discard(id: string): Promise<void> {
    // Le json d'abord : sans lui, un texte orphelin n'est plus proposé.
    await this.fs.rm(join(this.dir, `${id}.json`), { force: true })
    await this.fs.rm(join(this.dir, `${id}.maquette`), { force: true })
  }

  /**
   * Copies à proposer au démarrage : les sans-titre, et celles plus récentes que le fichier
   * (fichier disparu = copie gardée). Du plus récent au plus ancien.
   */
  async pending(fileMtime: (path: string) => Promise<number | null>): Promise<PendingBackup[]> {
    let names: string[]
    try {
      names = await this.fs.readdir(this.dir)
    } catch {
      return [] // pas encore de dossier : rien à proposer
    }
    const out: PendingBackup[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      let found: PendingBackup
      try {
        const meta: unknown = JSON.parse(await this.fs.readFile(join(this.dir, name), 'utf8'))
        if (!isMeta(meta)) throw new Error('copie illisible')
        const text = await this.fs.readFile(join(this.dir, `${id}.maquette`), 'utf8')
        found = { id, path: meta.path, savedAt: meta.savedAt, text }
      } catch {
        // Copie illisible : on la retire pour ne plus tomber dessus.
        await this.discard(id).catch(() => undefined)
        continue
      }
      if (found.path !== null) {
        const mtime = await fileMtime(found.path)
        if (mtime !== null && mtime >= found.savedAt) continue
      }
      out.push(found)
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  }
}
