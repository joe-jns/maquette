import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { Op } from '../../core/ops'
import { findNode, walk } from '../../core/tree'
import { docStore, useDoc } from '../state/store'
import { uiStore, useUi } from '../state/ui'
import { selectionMenu } from '../canvas/contextMenu'
import { Icon } from '../ui/icons'
import { Menu } from '../ui/Menu'
import { InlineName } from './InlineName'
import { layerDrop, layerRows, type LayerRow } from './layerRows'

type Zone = 'before' | 'inside' | 'after'

/** Actions d'une ligne : un seul objet stable, pour que la mémoïsation des lignes tienne. */
interface RowActions {
  click(id: string, e: MouseEvent): void
  toggle(id: string): void
  rename(id: string | null): void
  dragStart(id: string, e: DragEvent<HTMLElement>): void
  dragOver(index: number, row: LayerRow, e: DragEvent<HTMLElement>): void
  dragLeave(): void
  drop(index: number, row: LayerRow, e: DragEvent<HTMLElement>): void
  dragEnd(): void
  menu(id: string, e: MouseEvent): void
}

const zoneOf = (e: DragEvent<HTMLElement>, row: LayerRow): { ratio: number; zone: Zone } => {
  const box = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientY - box.top) / box.height
  const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : row.type === 'frame' ? 'inside' : 'before'
  return { ratio, zone }
}

/**
 * Place de la ligne dans la sélection :
 * - `sel` / `sel-open` : sélectionnée (`open` : ses enfants suivent, le bloc continue dessous) ;
 * - `in` / `in-last` : descendante d'un élément sélectionné (`last` : dernière ligne du bloc).
 */
type Tint = '' | 'sel' | 'sel-open' | 'in' | 'in-last'

function tintOf(selection: string[], row: LayerRow, next: string[] | null): Tint {
  if (selection.length === 0) return ''
  if (selection.includes(row.id)) return next?.includes(row.id) ? 'sel-open' : 'sel'
  // Ancêtre sélectionné le plus haut : c'est lui qui ouvre le bloc.
  const owner = row.ancestors.findLast((a) => selection.includes(a))
  if (!owner) return ''
  return next?.includes(owner) ? 'in' : 'in-last'
}

const sameList = (a: string[] | null, b: string[] | null) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]))

const sameRow = (a: LayerRow, b: LayerRow) =>
  a.id === b.id && a.name === b.name && a.type === b.type && a.depth === b.depth && a.parentId === b.parentId &&
  a.hasChildren === b.hasChildren && a.expanded === b.expanded && a.visible === b.visible && a.locked === b.locked &&
  a.auto === b.auto && a.icon === b.icon && sameList(a.ancestors, b.ancestors)

interface RowProps {
  row: LayerRow
  index: number
  /** Ancêtres de la ligne suivante (fin du bloc teinté), `null` pour la dernière. */
  next: string[] | null
  renaming: boolean
  dropZone: Zone | null
  actions: RowActions
}

/** Une ligne : lit sa propre sélection et son propre survol, ne se redessine que si elle change. */
const LayerRowView = memo(
  function LayerRowView({ row, index, next, renaming, dropZone, actions }: RowProps) {
    const tint = useUi((s) => tintOf(s.selection, row, next))
    const hover = useUi((s) => s.hoverId === row.id)
    const selected = tint === 'sel' || tint === 'sel-open'
    return (
      <li
        role="treeitem"
        aria-selected={selected}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        data-layer-id={row.id}
        data-tint={tint || undefined}
        className={[
          'layer-row',
          selected && 'is-selected',
          (tint === 'in' || tint === 'in-last') && 'is-in-selection',
          hover && 'is-hover',
          !row.visible && 'is-hidden',
          (row.icon === 'component' || row.icon === 'instance') && 'is-component',
          dropZone && `drop-${dropZone}`,
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: 4 + row.depth * 16 }}
        draggable={!renaming}
        onClick={(e) => actions.click(row.id, e)}
        onDoubleClick={() => actions.rename(row.id)}
        onContextMenu={(e) => actions.menu(row.id, e)}
        onMouseEnter={() => uiStore.getState().setHover(row.id)}
        onMouseLeave={() => uiStore.getState().setHover(null)}
        onDragStart={(e) => actions.dragStart(row.id, e)}
        onDragOver={(e) => actions.dragOver(index, row, e)}
        onDragLeave={actions.dragLeave}
        onDrop={(e) => actions.drop(index, row, e)}
        onDragEnd={actions.dragEnd}
      >
        <button
          type="button"
          className="twisty"
          aria-label={row.expanded ? 'Collapse' : 'Expand'}
          tabIndex={-1}
          style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation()
            actions.toggle(row.id)
          }}
        >
          <Icon name="chevronRight" size={16} className={row.expanded ? 'is-open' : undefined} />
        </button>
        <Icon name={row.icon} size={16} className="layer-icon" />
        {renaming ? (
          <InlineName
            value={row.name}
            onCommit={(name) => docStore.getState().dispatch([{ op: 'update', id: row.id, set: { name } }], 'Renommer')}
            onDone={() => actions.rename(null)}
          />
        ) : (
          <span className="layer-name">{row.name}</span>
        )}
        <span className="layer-actions">
          <button
            type="button"
            className={`layer-action${row.locked ? ' is-on' : ''}`}
            aria-label={row.locked ? 'Unlock' : 'Lock'}
            data-tooltip={row.locked ? 'Unlock' : 'Lock'}
            onClick={(e) => {
              e.stopPropagation()
              docStore.getState().dispatch([{ op: 'update', id: row.id, set: { locked: !row.locked } }], row.locked ? 'Déverrouiller' : 'Verrouiller')
            }}
          >
            <Icon name={row.locked ? 'lock' : 'unlock'} size={16} />
          </button>
          <button
            type="button"
            className={`layer-action${!row.visible ? ' is-on' : ''}`}
            aria-label={row.visible ? 'Hide' : 'Show'}
            data-tooltip={row.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation()
              docStore.getState().dispatch([{ op: 'update', id: row.id, set: { visible: !row.visible } }], row.visible ? 'Masquer' : 'Afficher')
            }}
          >
            <Icon name={row.visible ? 'eye' : 'eyeOff'} size={16} />
          </button>
        </span>
      </li>
    )
  },
  (a, b) =>
    a.index === b.index && a.renaming === b.renaming && a.dropZone === b.dropZone && a.actions === b.actions &&
    sameRow(a.row, b.row) && sameList(a.next, b.next),
)

/**
 * Arbre des calques de la page affichée (ordre de Figma), synchronisé avec le canevas.
 * Le panneau ne dépend ni de la sélection ni du survol : chaque ligne les lit elle-même.
 */
export function LayersPanel() {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]!)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<{ index: number; zone: Zone } | null>(null)
  const dragged = useRef<string[] | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const rows = useMemo(() => layerRows(page, expanded), [page, expanded])
  const latest = useRef({ page, rows, drop })
  latest.current = { page, rows, drop }

  // Quand la sélection change : ses ancêtres se déplient (replier ensuite un parent reste possible),
  // puis sa première ligne est ramenée dans la vue.
  useEffect(() => {
    const onSelection = (selection: string[]) => {
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
      const [first] = selection
      if (first) requestAnimationFrame(() => listRef.current?.querySelector(`[data-layer-id="${CSS.escape(first)}"]`)?.scrollIntoView({ block: 'nearest' }))
    }
    onSelection(uiStore.getState().selection)
    return uiStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) onSelection(s.selection)
    })
  }, [])

  const actions = useMemo<RowActions>(() => ({
    click(id, e) {
      const ui = uiStore.getState()
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        ui.select(ui.selection.includes(id) ? ui.selection.filter((s) => s !== id) : [...ui.selection, id])
      } else ui.select([id])
    },
    toggle(id) {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    rename: setRenaming,
    dragStart(id, e) {
      const ui = uiStore.getState()
      // Ordre du document (pas l'ordre des clics) : le bloc garde son ordre relatif.
      const ids = ui.selection.includes(id) ? ui.selection : [id]
      const order: string[] = []
      walk(docStore.getState().doc, ({ node }) => order.push(node.id))
      dragged.current = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    dragOver(index, row, e) {
      if (!dragged.current) return
      e.preventDefault()
      const { zone } = zoneOf(e, row)
      const d = latest.current.drop
      if (d?.index !== index || d.zone !== zone) setDrop({ index, zone })
    },
    dragLeave() {
      setDrop(null)
    },
    drop(index, row, e) {
      e.preventDefault()
      const ids = dragged.current
      dragged.current = null
      setDrop(null)
      if (!ids) return
      const { page: p, rows: r } = latest.current
      const target = layerDrop(p, r, index, zoneOf(e, row).ratio, ids)
      if (!target) return
      // Les éléments tirés gardent leur ordre relatif, à partir de la place visée.
      const ops: Op[] = ids.map((id, k) => ({ op: 'move', id, parent: target.parent, index: target.index + k }))
      docStore.getState().dispatch(ops, 'Déplacer')
    },
    dragEnd() {
      dragged.current = null
      setDrop(null)
    },
    menu(id, e) {
      // Comme Figma : un calque hors de la sélection devient la sélection.
      e.preventDefault()
      if (!uiStore.getState().selection.includes(id)) uiStore.getState().select([id])
      setMenu({ id, x: e.clientX, y: e.clientY })
    },
  }), [])

  return (
    <section className="panel-section layers" aria-label="Layers">
      <header className="panel-heading">
        <h2>Layers</h2>
      </header>
      <ul className="layer-list" role="tree" ref={listRef}>
        {rows.map((row, index) => (
          <LayerRowView
            key={row.id}
            row={row}
            index={index}
            next={rows[index + 1]?.ancestors ?? null}
            renaming={renaming === row.id}
            dropZone={drop?.index === index ? drop.zone : null}
            actions={actions}
          />
        ))}
        {rows.length === 0 && <li className="empty-note">No layers on this page.</li>}
      </ul>
      {menu && (
        <Menu
          label="Layer"
          x={menu.x}
          y={menu.y}
          items={selectionMenu({ rename: () => setRenaming(menu.id) })}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  )
}
