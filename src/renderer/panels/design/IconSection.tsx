import { useState } from 'react'
import { isStrokeSet, MATERIAL_WEIGHTS, PHOSPHOR_WEIGHTS } from '../../../core/icons/sets'
import type { IconNode, PhosphorWeight } from '../../../core/types'
import { IconSvg } from '../../canvas/IconSvg'
import { Select, type SelectOption } from '../../ui/Select'
import { useDoc } from '../../state/store'
import { mixed, setOps } from '../props'
import { ColorRow } from './ColorRow'
import { IconPicker, type IconStyle } from './IconPicker'
import { NumberField } from './NumberField'
import { applyPhase } from './PaintSections'
import { commit, FIELD_GLYPH, Icon, scrubWith, Section, useSelection } from './shared'

const PHOSPHOR_OPTIONS: SelectOption<PhosphorWeight>[] = PHOSPHOR_WEIGHTS.map((w) => ({ value: w, label: w[0]!.toUpperCase() + w.slice(1) }))
// Seule la graisse 400 est embarquée : les autres sont gardées (fichiers Pen) et dessinées en 400.
const MATERIAL_OPTIONS: SelectOption[] = MATERIAL_WEIGHTS.map((w) => ({ value: String(w), label: String(w), hint: w === 400 ? undefined : 'drawn at 400' }))

/** Ce que le sélecteur change : l'icône, son jeu et sa variante (une variante sans objet est retirée). */
function pickPatch(icon: string, style: IconStyle): Record<string, unknown> {
  const patch: Record<string, unknown> = { icon, set: style.set }
  if (style.set === 'phosphor') patch.weight = style.weight && style.weight !== 'regular' ? style.weight : null
  if (style.set === 'material-rounded') patch.filled = style.filled ? true : null
  return patch
}

/** Icônes sélectionnées : quelle icône et de quel jeu (sélecteur avec recherche), variante, couleur, épaisseur du trait. */
export function IconSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { nodes } = useSelection()
  const [picking, setPicking] = useState(false)
  const icons = nodes.filter((n): n is IconNode => n.type === 'icon')
  if (icons.length === 0 || icons.length !== nodes.length) return null
  const ids = icons.map((n) => n.id)
  const set = (patch: Record<string, unknown>) => setOps(ids, patch)
  const name = mixed(icons.map((n) => n.icon))
  const iconSet = mixed(icons.map((n) => n.set)) ?? 'lucide'
  const weight = mixed(icons.map((n) => n.weight))
  const filled = mixed(icons.map((n) => n.filled === true))
  const color = mixed(icons.map((n) => n.color))
  const width = mixed(icons.map((n) => n.strokeWidth))
  const one = icons[0]!
  const style: IconStyle | undefined =
    iconSet === 'mixed' ? undefined : { set: iconSet, ...(typeof one.weight === 'string' ? { weight: one.weight } : {}), ...(one.filled ? { filled: true } : {}) }

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
            {typeof name === 'string' && iconSet !== 'mixed' && (
              <IconSvg name={name} set={iconSet} weight={one.weight} filled={one.filled} size={16} strokeWidth={1.75} />
            )}
            <span>{name === 'mixed' ? 'Mixed' : name}</span>
          </span>
          <Icon d="M5 6.5 8 9.5l3-3" />
        </button>
        {picking && (
          <IconPicker
            current={typeof name === 'string' ? name : undefined}
            style={style}
            onClose={() => setPicking(false)}
            onPick={(icon, picked) => {
              setPicking(false)
              commit(set(pickPatch(icon, picked)), 'Icône')
            }}
          />
        )}
      </div>
      {iconSet === 'phosphor' && (
        <div className="field-grid">
          <Select
            label="Icon weight"
            value={weight === 'mixed' ? null : typeof weight === 'string' ? (weight as PhosphorWeight) : 'regular'}
            options={PHOSPHOR_OPTIONS}
            onChange={(w) => commit(set({ weight: w === 'regular' ? null : w }), 'Variante de l’icône')}
          />
        </div>
      )}
      {iconSet === 'material-rounded' && (
        <div className="field-grid">
          <Select
            label="Icon weight"
            value={weight === 'mixed' ? null : String(typeof weight === 'number' ? weight : 400)}
            options={MATERIAL_OPTIONS}
            onChange={(w) => commit(set({ weight: w === '400' ? null : Number(w) }), 'Graisse de l’icône')}
          />
          <div className="segmented" role="group" aria-label="Icon style">
            <button type="button" aria-pressed={filled === false} onClick={() => commit(set({ filled: null }), 'Icône en contour')}>Outlined</button>
            <button type="button" aria-pressed={filled === true} onClick={() => commit(set({ filled: true }), 'Icône pleine')}>Filled</button>
          </div>
        </div>
      )}
      {color !== 'mixed' && color !== null && (
        <ColorRow name="Icon color" color={color} styles={styles} apply={(c, phase) => applyPhase(set({ color: c }), phase, 'Couleur de l’icône')} />
      )}
      {iconSet !== 'mixed' && isStrokeSet(iconSet) && (
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
      )}
    </Section>
  )
}
