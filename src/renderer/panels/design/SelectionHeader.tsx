import type { Node } from '../../../core/types'
import { alignOps, canAlign, canDistribute, distributeOps, type AlignEdge, type DistributeAxis } from '../../canvas/alignOps'
import { worldRectOf } from '../../canvas/rects'
import { docStore } from '../../state/store'
import { commit, Icon as Glyph, useSelection } from './shared'

const TYPE_GLYPH = {
  frame: 'M5.5 2.5v11M10.5 2.5v11M2.5 5.5h11M2.5 10.5h11',
  column: 'M3.5 2.5h9v4.5h-9zM3.5 9h9v4.5h-9z',
  row: 'M2.5 3.5h4.5v9H2.5zM9 3.5h4.5v9H9z',
  text: 'M3.5 3.5h9M8 3.5v9',
  rectangle: 'M3 3h10v10H3z',
  ellipse: 'M8 2.75a5.25 5.25 0 1 0 0 10.5a5.25 5.25 0 1 0 0-10.5z',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M10.5 6.25h.01',
  icon: 'M8 2.5l1.6 3.3 3.65.5-2.65 2.6.62 3.6L8 10.8l-3.22 1.7.62-3.6-2.65-2.6 3.65-.5z',
  mixed: 'M5.5 5.5h8v8h-8zM2.5 10.5v-8h8',
} as const

const TYPE_NAME = { frame: 'Frame', column: 'Auto layout frame', row: 'Auto layout frame', text: 'Text', rectangle: 'Rectangle', ellipse: 'Ellipse', image: 'Image', icon: 'Icon', mixed: 'Layers' } as const

function kindOf(n: Node): keyof typeof TYPE_GLYPH {
  if (n.type === 'frame') return n.layout.mode === 'auto' ? n.layout.direction : 'frame'
  if (n.type === 'shape') return n.shape
  return n.type
}

const ALIGN: { edge: AlignEdge; label: string; d: string }[] = [
  { edge: 'left', label: 'Align left', d: 'M2.5 2.5v11M5 4.5h7.5V7H5zM5 9h4.5v2.5H5z' },
  { edge: 'hcenter', label: 'Align horizontal centers', d: 'M8 2.5v11M4 4.5h8V7H4zM5.5 9h5v2.5h-5z' },
  { edge: 'right', label: 'Align right', d: 'M13.5 2.5v11M3.5 4.5H11V7H3.5zM6.5 9H11v2.5H6.5z' },
  { edge: 'top', label: 'Align top', d: 'M2.5 2.5h11M4.5 5H7v7.5H4.5zM9 5h2.5v4.5H9z' },
  { edge: 'vcenter', label: 'Align vertical centers', d: 'M2.5 8h11M4.5 4H7v8H4.5zM9 5.5h2.5v5H9z' },
  { edge: 'bottom', label: 'Align bottom', d: 'M2.5 13.5h11M4.5 3.5H7V11H4.5zM9 6.5h2.5V11H9z' },
]

const DISTRIBUTE: { axis: DistributeAxis; label: string; d: string }[] = [
  { axis: 'horizontal', label: 'Distribute horizontal spacing', d: 'M2.5 2.5v11M13.5 2.5v11M6.5 5h3v6h-3z' },
  { axis: 'vertical', label: 'Distribute vertical spacing', d: 'M2.5 2.5h11M2.5 13.5h11M5 6.5h6v3H5z' },
]

/**
 * En-tête du panneau Design (Figma, Pen) : icône du type et nom de la sélection, puis la rangée
 * d'alignement. Un élément s'aligne sur son cadre parent, plusieurs sur leur boîte commune.
 */
export function SelectionHeader() {
  const { ids, nodes } = useSelection()
  if (nodes.length === 0) return null
  const kinds = [...new Set(nodes.map(kindOf))]
  const kind = kinds.length === 1 ? kinds[0]! : 'mixed'
  const name = nodes.length === 1 ? nodes[0]!.name : `${nodes.length} layers`
  const doc = docStore.getState().doc
  const alignable = canAlign(doc, ids)
  const distributable = canDistribute(doc, ids)

  return (
    <section className="selection-header" aria-label="Selection">
      <div className="selection-title">
        <span className="selection-icon" role="img" aria-label={TYPE_NAME[kind]}>
          <Glyph d={TYPE_GLYPH[kind]} />
        </span>
        <h2 className="selection-name">{name}</h2>
      </div>
      <div className="align-row" role="toolbar" aria-label="Align selection">
        {[ALIGN.slice(0, 3), ALIGN.slice(3)].map((group, g) => (
          <div key={g} className="align-group">
            {group.map((a) => (
              <button
                key={a.edge}
                type="button"
                aria-label={a.label}
                data-tooltip={a.label}
                disabled={!alignable}
                onClick={() => commit(alignOps(docStore.getState().doc, ids, a.edge, worldRectOf), a.label)}
              >
                <Glyph d={a.d} />
              </button>
            ))}
          </div>
        ))}
        {distributable && (
          <div className="align-group">
            {DISTRIBUTE.map((a) => (
              <button
                key={a.axis}
                type="button"
                aria-label={a.label}
                data-tooltip={a.label}
                onClick={() => commit(distributeOps(docStore.getState().doc, ids, a.axis, worldRectOf), a.label)}
              >
                <Glyph d={a.d} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
