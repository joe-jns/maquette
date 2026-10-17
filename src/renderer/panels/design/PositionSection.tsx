import type { Axis, Node } from '../../../core/types'
import { inFlow } from '../../canvas/canvasOps'
import { domMeasure } from '../../canvas/measure'
import { useDoc } from '../../state/store'
import { mixed, positionOps, setOps, sizeOps, sizingChoices, type SizeChoice } from '../props'
import { NumberField } from './NumberField'
import { commit, scrubWith, Section, useMeasured, useSelection } from './shared'

const MODE_LABEL: Record<SizeChoice, string> = { fixed: 'fixe', hug: 'contenu', fill: 'remplir' }
const MODE_TEXT: Record<SizeChoice, string> = { fixed: 'Fixe', hug: 'Contenu', fill: 'Remplir' }
const modeOf = (n: Node, axis: Axis): SizeChoice => {
  const s = n[axis]
  return typeof s === 'number' ? 'fixed' : s.mode
}

/** Position, taille (et ses modes fixe / contenu / remplir), opacité, arrondi. */
export function PositionSection() {
  const doc = useDoc((s) => s.doc)
  const { ids, nodes, locs } = useSelection()
  const measured = useMeasured(ids)
  const free = locs.filter((l) => !inFlow(l))
  const flowOnly = free.length === 0

  const sizeOf = (n: Node, axis: Axis) => {
    const s = n[axis]
    return typeof s === 'number' ? s : Math.round(measured[n.id]?.[axis] ?? 0)
  }

  const axisField = (axis: Axis, name: string, label: string) => (
    <NumberField
      name={name}
      label={label}
      value={mixed(nodes.map((n) => sizeOf(n, axis)))}
      min={1}
      onCommit={(v) => commit(setOps(ids, { [axis]: v }), 'Redimensionner')}
      scrub={scrubWith('Redimensionner', (v) => setOps(ids, { [axis]: v }))}
    />
  )

  const modes = (axis: Axis, name: string) => {
    const current = mixed(nodes.map((n) => modeOf(n, axis)))
    const choices = ids.map((id) => sizingChoices(doc, id, axis))
    return (
      <div className="segmented" role="group" aria-label={`${name} : mode`}>
        {(['fixed', 'hug', 'fill'] as SizeChoice[]).map((mode) => {
          const allowed = choices.some((c) => c[mode].ok)
          const reason = choices.find((c) => !c[mode].ok)?.[mode].reason
          return (
            <button
              key={mode}
              type="button"
              aria-label={`${name} : ${MODE_LABEL[mode]}`}
              aria-pressed={current === mode}
              disabled={!allowed}
              data-tooltip={allowed ? undefined : reason}
              onClick={() => commit(sizeOps(doc, ids, axis, mode, domMeasure), `${name} : ${MODE_LABEL[mode]}`)}
            >
              {MODE_TEXT[mode]}
            </button>
          )
        })}
      </div>
    )
  }

  const hasRadius = nodes.filter((n) => n.type === 'frame' || n.type === 'image' || (n.type === 'shape' && n.shape === 'rectangle'))
  const radius = mixed(hasRadius.map((n) => ('radius' in n ? n.radius : 0)))

  return (
    <Section title="Position et taille">
      <div className="field-grid">
        <NumberField
          name="X"
          label="X"
          value={flowOnly ? null : mixed(free.map((l) => l.node.x ?? 0))}
          disabled={flowOnly}
          tooltip={flowOnly ? 'Position calculée par la mise en page automatique' : undefined}
          onCommit={(v) => commit(positionOps(doc, ids, 'x', v), 'Déplacer')}
          scrub={scrubWith('Déplacer', (v) => positionOps(doc, ids, 'x', v))}
        />
        <NumberField
          name="Y"
          label="Y"
          value={flowOnly ? null : mixed(free.map((l) => l.node.y ?? 0))}
          disabled={flowOnly}
          tooltip={flowOnly ? 'Position calculée par la mise en page automatique' : undefined}
          onCommit={(v) => commit(positionOps(doc, ids, 'y', v), 'Déplacer')}
          scrub={scrubWith('Déplacer', (v) => positionOps(doc, ids, 'y', v))}
        />
        {axisField('width', 'Largeur', 'L')}
        {axisField('height', 'Hauteur', 'H')}
      </div>
      <div className="mode-rows">
        <div className="mode-row"><span>L</span>{modes('width', 'Largeur')}</div>
        <div className="mode-row"><span>H</span>{modes('height', 'Hauteur')}</div>
      </div>
      <div className="field-grid">
        <NumberField
          name="Opacité"
          label="◐"
          suffix="%"
          min={0}
          max={100}
          value={mixed(nodes.map((n) => Math.round(n.opacity * 100)))}
          onCommit={(v) => commit(setOps(ids, { opacity: v / 100 }), 'Opacité')}
          scrub={scrubWith('Opacité', (v) => setOps(ids, { opacity: v / 100 }))}
        />
        {hasRadius.length > 0 && (
          <NumberField
            name="Arrondi"
            label="◜"
            min={0}
            value={typeof radius === 'object' && radius !== null ? 'mixed' : radius}
            onCommit={(v) => commit(setOps(hasRadius.map((n) => n.id), { radius: v }), 'Arrondi')}
            scrub={scrubWith('Arrondi', (v) => setOps(hasRadius.map((n) => n.id), { radius: v }))}
          />
        )}
      </div>
    </Section>
  )
}
