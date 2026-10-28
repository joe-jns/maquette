import type { Axis, Node } from '../../../core/types'
import { inFlow } from '../../canvas/canvasOps'
import { domMeasure } from '../../canvas/measure'
import { useDoc } from '../../state/store'
import { mixed, positionOps, setOps, sizeOps, sizingChoices, type SizeChoice } from '../props'
import { Chevron, Select } from '../../ui/Select'
import { NumberField } from './NumberField'
import { commit, FIELD_GLYPH, Icon, scrubWith, Section, useMeasured, useSelection } from './shared'

const MODE_LABEL: Record<SizeChoice, string> = { fixed: 'fixe', hug: 'contenu', fill: 'remplir' }
const MODE_TEXT: Record<SizeChoice, string> = { fixed: 'Fixed', hug: 'Hug', fill: 'Fill' }
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

  const modeMenu = (axis: Axis, name: string) => {
    const current = mixed(nodes.map((n) => modeOf(n, axis)))
    const choices = ids.map((id) => sizingChoices(doc, id, axis))
    const allowed = (mode: SizeChoice) => choices.some((c) => c[mode].ok)
    // Rien à choisir (un rectangle posé librement n'a qu'une taille fixe) : pas de menu.
    if (current === 'fixed' && !allowed('hug') && !allowed('fill')) return null
    const size = mixed(nodes.map((n) => sizeOf(n, axis)))
    const options = (['fixed', 'hug', 'fill'] as SizeChoice[]).map((mode) => ({
      value: mode,
      label: mode === 'fixed' && typeof size === 'number' ? `${MODE_TEXT.fixed} (${size})` : MODE_TEXT[mode],
      disabled: !allowed(mode),
      reason: choices.find((c) => !c[mode].ok)?.[mode].reason,
    }))
    const shown = current === 'hug' || current === 'fill' ? MODE_TEXT[current] : null
    return (
      <Select
        label={`${name} mode`}
        className={`size-mode${shown ? ' has-mode' : ''}`}
        value={current === 'mixed' || current === null ? null : current}
        options={options}
        anchor={(b) => b.closest<HTMLElement>('.number-field') ?? b}
        onChange={(mode) => commit(sizeOps(doc, ids, axis, mode, domMeasure), `${name} : ${MODE_LABEL[mode]}`)}
      >
        {shown ?? <Chevron />}
      </Select>
    )
  }

  const axisField = (axis: Axis, name: string, label: string) => {
    const modes = nodes.map((n) => modeOf(n, axis))
    return (
      <NumberField
        name={name}
        label={label}
        value={mixed(nodes.map((n) => sizeOf(n, axis)))}
        min={1}
        dim={modes.every((m) => m !== 'fixed')}
        onCommit={(v) => commit(setOps(ids, { [axis]: v }), 'Redimensionner')}
        scrub={scrubWith('Redimensionner', (v) => setOps(ids, { [axis]: v }))}
        trailing={modeMenu(axis, name)}
      />
    )
  }

  const hasRadius = nodes.filter((n) => n.type === 'frame' || n.type === 'image' || (n.type === 'shape' && n.shape === 'rectangle'))
  const radius = mixed(hasRadius.map((n) => ('radius' in n ? n.radius : 0)))

  return (
    <Section title="Position">
      <div className="field-grid">
        <NumberField
          name="X"
          label="X"
          value={flowOnly ? null : mixed(free.map((l) => l.node.x ?? 0))}
          disabled={flowOnly}
          title={flowOnly ? 'Position set by auto layout' : undefined}
          onCommit={(v) => commit(positionOps(doc, ids, 'x', v), 'Déplacer')}
          scrub={scrubWith('Déplacer', (v) => positionOps(doc, ids, 'x', v))}
        />
        <NumberField
          name="Y"
          label="Y"
          value={flowOnly ? null : mixed(free.map((l) => l.node.y ?? 0))}
          disabled={flowOnly}
          title={flowOnly ? 'Position set by auto layout' : undefined}
          onCommit={(v) => commit(positionOps(doc, ids, 'y', v), 'Déplacer')}
          scrub={scrubWith('Déplacer', (v) => positionOps(doc, ids, 'y', v))}
        />
        {axisField('width', 'Width', 'W')}
        {axisField('height', 'Height', 'H')}
      </div>
      <div className="field-grid">
        <NumberField
          name="Opacity"
          label={<Icon d={FIELD_GLYPH.opacity} />}
          suffix="%"
          min={0}
          max={100}
          value={mixed(nodes.map((n) => Math.round(n.opacity * 100)))}
          onCommit={(v) => commit(setOps(ids, { opacity: v / 100 }), 'Opacité')}
          scrub={scrubWith('Opacité', (v) => setOps(ids, { opacity: v / 100 }))}
        />
        {hasRadius.length > 0 && (
          <NumberField
            name="Corner radius"
            label={<Icon d={FIELD_GLYPH.radius} />}
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
