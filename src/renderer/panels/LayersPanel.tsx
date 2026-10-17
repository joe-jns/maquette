import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { Op } from '../../core/ops'
import { findNode, walk } from '../../core/tree'
import type { Page } from '../../core/types'
import { docStore, useDoc } from '../state/store'
import { uiStore, useUi } from '../state/ui'
import { InlineName } from './InlineName'
import { layerDrop, layerRows, type LayerRow } from './layerRows'

/** Icône par type d'élément (un cadre automatique montre sa direction). */
function TypeIcon({ row, page }: { row: LayerRow; page: Page }) {
  const node = findNode({ format: 'maquette', version: 1, styles: { colors: [], text: [] }, pages: [page] }, row.id)?.node
  let d = 'M3 3h10v10H3z'
  if (node?.type === 'frame') {
    d = node.layout.mode === 'auto'
      ? node.layout.direction === 'row' ? 'M2.5 4.5h4v7h-4zM9.5 4.5h4v7h-4z' : 'M4.5 2.5h7v4h-7zM4.5 9.5h7v4h-7z'
      : 'M5 2v12M11 2v12M2 5h12M2 11h12'
  } else if (node?.type === 'text') d = 'M4 4h8M8 4v9'
  else if (node?.type === 'image') d = 'M2.5 3.5h11v9h-11zM2.5 10.5l3.5-3 3 2.5 2-1.5 2.5 2'
  else if (node?.type === 'shape' && node.shape === 'ellipse') d = 'M8 2.8a5.2 5.2 0 1 0 0.01 0z'
  return (
    <svg className="layer-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

const EYE = 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 0 0.01 0z'
const EYE_OFF = 'M2 2l12 12M6.3 4c.5-.2 1.1-.3 1.7-.3 4.1 0 6.5 4.3 6.5 4.3s-.6 1.1-1.8 2.3M10.6 11.7c-.8.5-1.7.8-2.6.8-4.1 0-6.5-4.5-6.5-4.5s.8-1.5 2.3-2.8'
const LOCK = 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2'
const UNLOCK = 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 3.9-.6'

/** Arbre des calques de la page affichée (ordre de Figma), synchronisé avec le canevas. */
export function LayersPanel() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  const doc = useDoc((s) => s.doc)
  const selection = useUi((s) => s.selection)
  const hoverId = useUi((s) => s.hoverId)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ index: number; zone: 'before' | 'inside' | 'after' } | null>(null)
  const dragged = useRef<string[] | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Les ancêtres de la sélection se déplient pour qu'elle soit visible.
  // Seulement quand la sélection change : replier ensuite un parent de la sélection reste possible.
  useEffect(() => {
    const current = docStore.getState().doc
    const need = new Set<string>()
    for (const id of selection) {
      let loc = findNode(current, id)
      while (loc?.parent) {
        need.add(loc.parent.id)
        loc = findNode(current, loc.parent.id)
      }
    }
    setExpanded((prev) => ([...need].every((id) => prev.has(id)) ? prev : new Set([...prev, ...need])))
  }, [selection])

  // La ligne sélectionnée reste visible (après le dépliage ci-dessus).
  useEffect(() => {
    const [first] = selection
    if (first) requestAnimationFrame(() => listRef.current?.querySelector(`[data-layer-id="${CSS.escape(first)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }, [selection])

  const rows = useMemo(() => layerRows(page, expanded), [page, expanded])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const click = (id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const ui = uiStore.getState()
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ui.select(ui.selection.includes(id) ? ui.selection.filter((s) => s !== id) : [...ui.selection, id])
    } else ui.select([id])
  }

  const zoneOf = (e: DragEvent<HTMLElement>, row: LayerRow): { ratio: number; zone: 'before' | 'inside' | 'after' } => {
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - box.top) / box.height
    const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : row.type === 'frame' ? 'inside' : 'before'
    return { ratio, zone }
  }

  const onDrop = (e: DragEvent<HTMLElement>, index: number, row: LayerRow) => {
    e.preventDefault()
    const ids = dragged.current
    dragged.current = null
    setDrop(null)
    if (!ids) return
    const target = layerDrop(page, rows, index, zoneOf(e, row).ratio, ids)
    if (!target) return
    // Les éléments tirés gardent leur ordre relatif, à partir de la place visée.
    const ops: Op[] = ids.map((id, k) => ({ op: 'move', id, parent: target.parent, index: target.index + k }))
    docStore.getState().dispatch(ops, 'Déplacer')
  }

  return (
    <section className="panel-section layers" aria-label="Calques">
      <header className="panel-heading">
        <h2>Calques</h2>
      </header>
      <ul className="layer-list" role="tree" ref={listRef}>
        {rows.map((row, index) => {
          const selected = selection.includes(row.id)
          return (
            <li
              key={row.id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              data-layer-id={row.id}
              className={[
                'layer-row',
                selected && 'is-selected',
                hoverId === row.id && 'is-hover',
                !row.visible && 'is-hidden',
                drop?.index === index && `drop-${drop.zone}`,
              ].filter(Boolean).join(' ')}
              style={{ paddingLeft: 6 + row.depth * 14 }}
              draggable={renaming !== row.id}
              onClick={(e) => click(row.id, e)}
              onDoubleClick={() => setRenaming(row.id)}
              onMouseEnter={() => uiStore.getState().setHover(row.id)}
              onMouseLeave={() => uiStore.getState().setHover(null)}
              onDragStart={(e) => {
                const ui = uiStore.getState()
                // Ordre du document (pas l'ordre des clics) : le bloc garde son ordre relatif.
                const ids = ui.selection.includes(row.id) ? ui.selection : [row.id]
                const order: string[] = []
                walk(docStore.getState().doc, ({ node }) => order.push(node.id))
                dragged.current = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', row.id)
              }}
              onDragOver={(e) => {
                if (!dragged.current) return
                e.preventDefault()
                const { zone } = zoneOf(e, row)
                if (drop?.index !== index || drop.zone !== zone) setDrop({ index, zone })
              }}
              onDragLeave={() => setDrop(null)}
              onDrop={(e) => onDrop(e, index, row)}
              onDragEnd={() => {
                dragged.current = null
                setDrop(null)
              }}
            >
              <button
                type="button"
                className="twisty"
                aria-label={row.expanded ? 'Replier' : 'Déplier'}
                tabIndex={-1}
                style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(row.id)
                }}
              >
                <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden style={{ transform: row.expanded ? 'rotate(90deg)' : undefined }}>
                  <path d="M3 1.5 7 5 3 8.5z" fill="currentColor" />
                </svg>
              </button>
              <TypeIcon row={row} page={page} />
              {renaming === row.id ? (
                <InlineName
                  value={row.name}
                  onCommit={(name) => docStore.getState().dispatch([{ op: 'update', id: row.id, set: { name } }], 'Renommer')}
                  onDone={() => setRenaming(null)}
                />
              ) : (
                <span className="layer-name">{row.name}</span>
              )}
              <span className="layer-actions">
                <button
                  type="button"
                  className={`icon-button small${row.locked ? ' is-on' : ''}`}
                  aria-label={row.locked ? 'Déverrouiller' : 'Verrouiller'}
                  data-tooltip={row.locked ? 'Déverrouiller' : 'Verrouiller'}
                  onClick={(e) => {
                    e.stopPropagation()
                    docStore.getState().dispatch([{ op: 'update', id: row.id, set: { locked: !row.locked } }], row.locked ? 'Déverrouiller' : 'Verrouiller')
                  }}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
                    <path d={row.locked ? LOCK : UNLOCK} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`icon-button small${!row.visible ? ' is-on' : ''}`}
                  aria-label={row.visible ? 'Masquer' : 'Afficher'}
                  data-tooltip={row.visible ? 'Masquer' : 'Afficher'}
                  onClick={(e) => {
                    e.stopPropagation()
                    docStore.getState().dispatch([{ op: 'update', id: row.id, set: { visible: !row.visible } }], row.visible ? 'Masquer' : 'Afficher')
                  }}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
                    <path d={row.visible ? EYE : EYE_OFF} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            </li>
          )
        })}
        {rows.length === 0 && <li className="empty-note">Aucun élément sur cette page.</li>}
      </ul>
    </section>
  )
}
