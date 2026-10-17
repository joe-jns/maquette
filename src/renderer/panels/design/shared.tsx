import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { Op } from '../../../core/ops'
import { findNode, type NodeLocation } from '../../../core/tree'
import type { Node, Rect } from '../../../core/types'
import { parentRectOf } from '../../canvas/rects'
import { docStore, useDoc } from '../../state/store'
import { useUi } from '../../state/ui'
import type { Scrub } from './NumberField'

/** La sélection courante, résolue dans le document (éléments disparus ignorés). */
export function useSelection(): { ids: string[]; nodes: Node[]; locs: NodeLocation[] } {
  const doc = useDoc((s) => s.doc)
  const selection = useUi((s) => s.selection)
  return useMemo(() => {
    const locs = selection.map((id) => findNode(doc, id)).filter((l): l is NodeLocation => l !== null)
    return { ids: locs.map((l) => l.node.id), nodes: locs.map((l) => l.node), locs }
  }, [doc, selection])
}

/** Tailles affichées des éléments (mesurées dans le rendu, après chaque mise à jour). */
export function useMeasured(ids: string[]): Record<string, Rect> {
  const doc = useDoc((s) => s.doc)
  const [rects, setRects] = useState<Record<string, Rect>>({})
  useLayoutEffect(() => {
    const next: Record<string, Rect> = {}
    for (const id of ids) {
      const r = parentRectOf(id)
      if (r) next[id] = r
    }
    setRects(next)
  }, [doc, ids.join('|')])
  return rects
}

export const commit = (ops: Op[], label: string) => {
  if (ops.length) docStore.getState().dispatch(ops, label)
}

/** Glisser sur une étiquette : un aperçu en direct, une seule entrée d'historique. */
export const scrubWith = (label: string, opsFor: (value: number) => Op[]): Scrub => ({
  start: () => docStore.getState().beginGesture(),
  change: (value) => docStore.getState().previewGesture(opsFor(value)),
  end: () => docStore.getState().commitGesture(label),
})

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="design-section" aria-label={title}>
      <header className="design-heading">
        <h3>{title}</h3>
        {actions && <div className="design-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function IconButton({ label, onClick, pressed, disabled, title, children }: {
  label: string; onClick(): void; pressed?: boolean; disabled?: boolean; title?: string; children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`icon-button${pressed ? ' is-pressed' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
