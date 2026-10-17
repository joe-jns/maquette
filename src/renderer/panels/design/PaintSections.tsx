import type { ReactNode } from 'react'
import type { Op } from '../../../core/ops'
import { isGradient } from '../../../core/paint'
import type { Fill, Shadow, Stroke } from '../../../core/types'
import { docStore, useDoc } from '../../state/store'
import { Checkbox } from '../../ui/Checkbox'
import { Select } from '../../ui/Select'
import { mixed, setOps } from '../props'
import { ColorRow, type ColorPhase } from './ColorRow'
import { GradientRow, toGradient } from './GradientRow'
import { NumberField } from './NumberField'
import { commit, FIELD_GLYPH, Icon, IconButton, scrubWith, Section, useSelection } from './shared'

/** Couleur : aperçu en direct pendant la recherche, une seule entrée d'historique à la validation. */
export function applyPhase(ops: Op[], phase: ColorPhase, label: string): void {
  const store = docStore.getState()
  if (phase === 'preview') {
    if (!store.inGesture) store.beginGesture()
    store.previewGesture(ops)
    return
  }
  if (store.inGesture) {
    store.previewGesture(ops)
    store.commitGesture(label)
  } else commit(ops, label)
}

const PLUS = 'M8 3v10M3 8h10'

/** Remplissages d'un cadre ou d'une forme : couleurs et dégradés. */
export function FillSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { nodes } = useSelection()
  const painted = nodes.filter((n) => n.type === 'frame' || n.type === 'shape')
  if (painted.length === 0 || painted.length !== nodes.length) return null
  const ids = painted.map((n) => n.id)
  const fills = mixed(painted.map((n) => ('fills' in n ? n.fills : [])))
  const list = Array.isArray(fills) ? fills : []
  const set = (next: Fill[]) => setOps(ids, { fills: next })
  const replace = (i: number, fill: Fill) => set(list.map((f, k) => (k === i ? fill : f)))
  const remove = (i: number) => commit(set(list.filter((_, k) => k !== i)), 'Retirer un remplissage')

  return (
    <Section
      title="Remplissage"
      actions={
        <IconButton label="Ajouter un remplissage" onClick={() => commit(set([...list, '#D9D9D9']), 'Ajouter un remplissage')}>
          <Icon d={PLUS} />
        </IconButton>
      }
    >
      {fills === 'mixed' ? (
        <button type="button" className="text-button" onClick={() => commit(set((painted[0] as { fills: Fill[] }).fills), 'Remplissage')}>
          Remplissages différents — tout aligner sur le premier
        </button>
      ) : (
        list.map((f, i) =>
          isGradient(f) ? (
            <GradientRow
              key={i}
              name={`Remplissage ${i + 1}`}
              gradient={f}
              styles={styles}
              apply={(fill, phase) => applyPhase(replace(i, fill), phase, 'Dégradé')}
              opsFor={(fill) => replace(i, fill)}
              onRemove={() => remove(i)}
            />
          ) : (
            <ColorRow
              key={i}
              name={`Remplissage ${i + 1}`}
              color={f}
              styles={styles}
              apply={(color, phase) => applyPhase(replace(i, color), phase, 'Remplissage')}
              onRemove={() => remove(i)}
              onGradient={() => commit(replace(i, toGradient(f, styles)), 'Dégradé')}
              onCreateStyle={(value) =>
                commit(
                  [
                    { op: 'style.color.set', id: '$style', name: `Couleur ${styles.colors.length + 1}`, value },
                    ...replace(i, { style: '$style' }),
                  ],
                  'Créer une couleur nommée',
                )
              }
            />
          ),
        )
      )}
    </Section>
  )
}

const ALIGNS: { value: Stroke['align']; label: string }[] = [
  { value: 'inside', label: 'Intérieur' },
  { value: 'center', label: 'Centre' },
  { value: 'outside', label: 'Extérieur' },
]

/** Contour : couleur, épaisseur, position. Les contours ne prennent jamais de place dans la mise en page. */
export function StrokeSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { nodes } = useSelection()
  if (nodes.some((n) => n.type === 'text' || n.type === 'icon')) return null
  const ids = nodes.map((n) => n.id)
  const stroke = mixed(nodes.map((n) => ('stroke' in n ? (n.stroke ?? null) : null)))
  const set = (next: Stroke | null) => setOps(ids, { stroke: next })
  const current = stroke === 'mixed' ? null : stroke

  return (
    <Section
      title="Contour"
      actions={
        current ? (
          <IconButton label="Retirer le contour" onClick={() => commit(set(null), 'Retirer le contour')}><Icon d="M4 8h8" /></IconButton>
        ) : (
          <IconButton label="Ajouter un contour" onClick={() => commit(set({ color: '#000000', width: 1, align: 'inside' }), 'Ajouter un contour')}>
            <Icon d={PLUS} />
          </IconButton>
        )
      }
    >
      {stroke === 'mixed' && <p className="empty-note">Contours différents.</p>}
      {current && (
        <>
          <ColorRow
            name="Contour"
            color={current.color}
            styles={styles}
            apply={(color, phase) => applyPhase(set({ ...current, color }), phase, 'Contour')}
          />
          <div className="field-grid">
            <NumberField
              name="Épaisseur du contour"
              label={<Icon d={FIELD_GLYPH.stroke} />}
              min={0.5}
              step={1}
              value={current.width}
              onCommit={(v) => commit(set({ ...current, width: v }), 'Contour')}
              scrub={scrubWith('Contour', (v) => set({ ...current, width: Math.max(0.5, v) }))}
            />
            <Select
              label="Position du contour"
              value={current.align}
              options={ALIGNS}
              onChange={(align) => commit(set({ ...current, align }), 'Contour')}
            />
          </div>
        </>
      )}
    </Section>
  )
}

/** Ombres portées ou intérieures. */
export function ShadowSection() {
  const styles = useDoc((s) => s.doc.styles)
  const { nodes } = useSelection()
  if (nodes.some((n) => n.type === 'text' || n.type === 'icon')) return null
  const ids = nodes.map((n) => n.id)
  const shadows = mixed(nodes.map((n) => ('shadows' in n ? n.shadows : [])))
  const list = Array.isArray(shadows) ? shadows : []
  const set = (next: Shadow[]) => setOps(ids, { shadows: next })
  const update = (i: number, patch: Partial<Shadow>) => set(list.map((s, k) => (k === i ? { ...s, ...patch } : s)))

  return (
    <Section
      title="Ombres"
      actions={
        <IconButton
          label="Ajouter une ombre"
          onClick={() => commit(set([...list, { x: 0, y: 4, blur: 12, spread: 0, color: '#00000026', inset: false }]), 'Ajouter une ombre')}
        >
          <Icon d={PLUS} />
        </IconButton>
      }
    >
      {shadows === 'mixed' && <p className="empty-note">Ombres différentes.</p>}
      {list.map((s, i) => {
        const n = i + 1
        const num = (key: 'x' | 'y' | 'blur' | 'spread', name: string, label: ReactNode, min?: number) => (
          <NumberField
            name={`${name} de l’ombre ${n}`}
            label={label}
            min={min}
            value={s[key]}
            onCommit={(v) => commit(update(i, { [key]: v }), 'Ombre')}
            scrub={scrubWith('Ombre', (v) => update(i, { [key]: min !== undefined ? Math.max(min, v) : v }))}
          />
        )
        return (
          <div key={i} className="shadow-block">
            <div className="field-grid">
              {num('x', 'X', 'X')}
              {num('y', 'Y', 'Y')}
              {num('blur', 'Flou', <Icon d={FIELD_GLYPH.blur} />, 0)}
              {num('spread', 'Étendue', <Icon d={FIELD_GLYPH.spread} />)}
            </div>
            <ColorRow
              name={`Ombre ${n}`}
              color={s.color}
              styles={styles}
              apply={(color, phase) => applyPhase(update(i, { color }), phase, 'Ombre')}
              onRemove={() => commit(set(list.filter((_, k) => k !== i)), 'Retirer une ombre')}
            />
            <Checkbox checked={s.inset} onChange={(inset) => commit(update(i, { inset }), 'Ombre')}>
              Ombre intérieure
            </Checkbox>
          </div>
        )
      })}
    </Section>
  )
}
