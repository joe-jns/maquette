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

/** Glyphes des étiquettes de champ (à la place de caractères Unicode de tailles inégales). */
export const FIELD_GLYPH = {
  opacity: 'M8 2.75a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 1 0 0-10.5zM8 2.75v10.5',
  radius: 'M3.5 12.5V8A4.5 4.5 0 0 1 8 3.5h4.5',
  padH: 'M2.5 3v10M13.5 3v10M6 6h4v4H6z',
  padV: 'M3 2.5h10M3 13.5h10M6 6h4v4H6z',
  stroke: 'M3 4.5h10M3 8h10M3 11.5h10',
  fontSize: 'M4 5V3.5h8V5M8 3.5v9M6.5 12.5h3',
  lineHeight: 'M3 2.5h10M3 13.5h10M8 5.5v5M6.5 7 8 5.5 9.5 7M6.5 9 8 10.5 9.5 9',
  letterSpacing: 'M2.5 3v10M13.5 3v10M5.5 11.5 8 4.5l2.5 7M6.5 9h3',
} as const

/** Glyphe de 16 px (dans une boîte de 24), trait de 1,25 px, bouts ronds. */
export const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
