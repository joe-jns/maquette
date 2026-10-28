import { useState } from 'react'
import type { IconNode } from '../../../core/types'
import { IconSvg } from '../../canvas/IconSvg'
import { useDoc } from '../../state/store'
import { mixed, setOps } from '../props'
import { ColorRow } from './ColorRow'
import { IconPicker } from './IconPicker'
import { NumberField } from './NumberField'
import { applyPhase } from './PaintSections'
import { commit, FIELD_GLYPH, Icon, scrubWith, Section, useSelection } from './shared'

/** Icônes sélectionnées : quelle icône (sélecteur avec recherche), couleur, épaisseur du trait. */
export function IconSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { nodes } = useSelection()
  const [picking, setPicking] = useState(false)
  const icons = nodes.filter((n): n is IconNode => n.type === 'icon')
  if (icons.length === 0 || icons.length !== nodes.length) return null
  const ids = icons.map((n) => n.id)
  const set = (patch: Record<string, unknown>) => setOps(ids, patch)
  const name = mixed(icons.map((n) => n.icon))
  const color = mixed(icons.map((n) => n.color))
  const width = mixed(icons.map((n) => n.strokeWidth))

  return (
    <Section title="Icon">
      <div className="font-row">
        <button
          type="button"
          className="font-button icon-trigger"
          data-icon-trigger
          aria-label="Icon"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <span className="icon-current">
            {typeof name === 'string' && <IconSvg name={name} size={16} strokeWidth={1.75} />}
            <span>{name === 'mixed' ? 'Mixed' : name}</span>
          </span>
          <Icon d="M5 6.5 8 9.5l3-3" />
        </button>
        {picking && (
          <IconPicker
            current={typeof name === 'string' ? name : undefined}
            onClose={() => setPicking(false)}
            onPick={(icon) => {
              setPicking(false)
              commit(set({ icon }), 'Icône')
            }}
          />
        )}
      </div>
      {color !== 'mixed' && color !== null && (
        <ColorRow name="Icon color" color={color} styles={styles} apply={(c, phase) => applyPhase(set({ color: c }), phase, 'Couleur de l’icône')} />
      )}
      <div className="field-grid">
        <NumberField
          name="Icon stroke width"
          label={<Icon d={FIELD_GLYPH.stroke} />}
          min={0.25}
          max={6}
          step={0.25}
          value={width}
          onCommit={(v) => commit(set({ strokeWidth: Math.min(6, Math.max(0.25, v)) }), 'Épaisseur du trait')}
          scrub={scrubWith('Épaisseur du trait', (v) => set({ strokeWidth: Math.min(6, Math.max(0.25, Math.round(v * 4) / 4)) }))}
        />
      </div>
    </Section>
  )
}
