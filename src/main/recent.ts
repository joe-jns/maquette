import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from './files'

// Sous Windows, « C:\A.maquette » et « c:\a.maquette » sont le même fichier.
const sameKey = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)

/** Met `path` en tête, retire son ancienne place, coupe à `max` entrées. */
export function addRecent(list: string[], path: string, max = 10): string[] {
  const key = sameKey(path)
  return [path, ...list.filter((p) => sameKey(p) !== key)].slice(0, max)
}

/** Liste des fichiers récents, gardée en JSON (`<userData>/recent.json`). */
export class RecentStore {
  constructor(private readonly file: string) {}

  /** Fichier absent ou illisible = liste vide ; les entrées qui ne sont pas du texte sont écartées. */
  async list(): Promise<string[]> {
    try {
      const data: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      return Array.isArray(data) ? data.filter((p): p is string => typeof p === 'string') : []
    } catch {
      return []
    }
  }

  async add(path: string): Promise<string[]> {
    return this.save(addRecent(await this.list(), path))
  }

  async remove(path: string): Promise<string[]> {
    const key = sameKey(path)
    return this.save((await this.list()).filter((p) => sameKey(p) !== key))
  }

  private async save(list: string[]): Promise<string[]> {
    await writeFileAtomic(this.file, JSON.stringify(list, null, 2))
    return list
  }
}
