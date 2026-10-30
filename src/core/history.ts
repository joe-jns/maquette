import { applyPatches, enablePatches, type Patch } from 'immer'
import type { MaquetteDocument } from './types'

enablePatches()

/**
 * `group` : entrées d'une même action longue (une réponse de Claude) ; deux entrées qui se suivent
 * avec le même groupe n'en font qu'une.
 */
export interface HistoryEntry { label: string; patches: Patch[]; inversePatches: Patch[]; group?: string }

export class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  constructor(private readonly limit = 200) {}

  push(entry: HistoryEntry): void {
    if (entry.patches.length === 0) return
    this.future = []
    const top = this.past[this.past.length - 1]
    if (entry.group !== undefined && top?.group === entry.group) {
      // Même groupe que l'entrée du dessus : fusion, le libellé reste celui du groupe.
      this.past[this.past.length - 1] = {
        label: top.label,
        group: top.group,
        patches: [...top.patches, ...entry.patches],
        inversePatches: [...entry.inversePatches, ...top.inversePatches],
      }
      return
    }
    this.past.push(entry)
    if (this.past.length > this.limit) this.past.shift()
  }

  undo(doc: MaquetteDocument): { doc: MaquetteDocument; label: string } | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(entry)
    return { doc: applyPatches(doc, entry.inversePatches), label: entry.label }
  }

  redo(doc: MaquetteDocument): { doc: MaquetteDocument; label: string } | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return { doc: applyPatches(doc, entry.patches), label: entry.label }
  }

  canUndo(): boolean { return this.past.length > 0 }
  canRedo(): boolean { return this.future.length > 0 }

  /**
   * Nombre d'entrées au-dessus de la plus ancienne entrée du groupe (0 : il est au sommet) ; null s'il
   * n'est plus dans les entrées à annuler.
   */
  depthOf(group: string): number | null {
    const i = this.past.findIndex((e) => e.group === group)
    return i < 0 ? null : this.past.length - 1 - i
  }

  /** Groupe de l'entrée au sommet (undefined : aucune, ou sans groupe). */
  topGroup(): string | undefined {
    return this.past[this.past.length - 1]?.group
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
