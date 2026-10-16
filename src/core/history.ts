import { applyPatches, enablePatches, type Patch } from 'immer'
import type { MaquetteDocument } from './types'

enablePatches()

export interface HistoryEntry { label: string; patches: Patch[]; inversePatches: Patch[] }

export class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  constructor(private readonly limit = 200) {}

  push(entry: HistoryEntry): void {
    if (entry.patches.length === 0) return
    this.past.push(entry)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
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

  clear(): void {
    this.past = []
    this.future = []
  }
}
