import { watch as fsWatch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

const sameName = (a: string, b: string) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b

/**
 * Prévient quand le fichier ouvert change sur le disque à cause de quelqu'un d'autre.
 * On surveille le dossier parent, filtré sur le nom du fichier : un enregistrement
 * atomique (temporaire + renommage) remplace le fichier, et une surveillance posée
 * sur le fichier lui-même s'arrêterait là. Les rafales d'événements (plusieurs par
 * écriture sous Windows) sont regroupées, puis on relit : seul un contenu différent
 * du dernier connu (`wrote`) compte, ce qui ignore nos propres enregistrements.
 */
export class FileWatcher {
  private path: string | null = null
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private known: string | null = null
  // Change à chaque watch/close : une relecture lancée avant est jetée à son retour.
  private generation = 0
  private readonly debounceMs: number
  private readonly read: (p: string) => Promise<string>

  constructor(
    private readonly onExternalChange: (path: string) => void,
    opts: { debounceMs?: number; read?: (p: string) => Promise<string> } = {},
  ) {
    this.debounceMs = opts.debounceMs ?? 300
    this.read = opts.read ?? ((p) => readFile(p, 'utf8'))
  }

  /** Surveille `path` (null = plus rien). Le dernier contenu connu est gardé. */
  watch(path: string | null): void {
    this.stop()
    this.path = path
    if (!path) return
    const name = basename(path)
    try {
      this.watcher = fsWatch(dirname(path), (_event, file) => {
        // Nom absent (possible selon le système) : on relit par prudence.
        if (file && !sameName(file.toString(), name)) return
        this.schedule()
      })
      // Dossier supprimé ou démonté : on se tait plutôt que de faire tomber l'app.
      this.watcher.on('error', () => this.stop())
    } catch {
      this.watcher = null
    }
  }

  /** Contenu que l'on vient d'écrire ou d'ouvrir : le retrouver sur le disque n'est pas un changement. */
  wrote(text: string): void {
    this.known = text
  }

  close(): void {
    this.stop()
    this.path = null
  }

  private stop(): void {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    this.watcher = null
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.check()
    }, this.debounceMs)
  }

  private async check(): Promise<void> {
    const path = this.path
    const gen = this.generation
    if (!path) return
    let text: string
    try {
      text = await this.read(path)
    } catch {
      return // supprimé, illisible ou en cours de renommage : rien
    }
    if (gen !== this.generation || text === this.known) return
    // Ce contenu devient le connu : un événement de plus sans changement ne redit rien.
    this.known = text
    this.onExternalChange(path)
  }
}
