import type { ReactNode } from 'react'
import type { Op } from '../../../core/ops'
import { isGradient, isImageFill } from '../../../core/paint'
import type { Blurs, Color, Fill, Shadow, Stroke } from '../../../core/types'
import { docStore, useDoc } from '../../state/store'
import { Checkbox } from '../../ui/Checkbox'
import { Select } from '../../ui/Select'
import { mixed, setOps } from '../props'
import { ColorRow, type ColorPhase } from './ColorRow'
import { GradientRow, toGradient } from './GradientRow'
import { IMAGE_GLYPH, ImageFillRow, useImagePicker } from './ImageFillRow'
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

/** Glyphe « dégradé » : un carré qui s'efface en diagonale. */
const GradientGlyph = () => (
  <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
    <defs>
      <linearGradient id="glyph-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="currentColor" />
        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="url(#glyph-gradient)" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

/** Remplissages d'un cadre, d'une forme ou d'un vecteur : couleurs, dégradés et (sauf vecteur) images. */
export function FillSection() {
  const { nodes } = useSelection()
  const painted = nodes.filter((n) => n.type === 'frame' || n.type === 'shape' || n.type === 'vector')
  if (painted.length === 0 || painted.length !== nodes.length) return null
  return <Fills painted={painted} images={!painted.some((n) => n.type === 'vector')} />
}

function Fills({ painted, images }: { painted: { id: string; fills: Fill[] }[]; images: boolean }) {
  const styles = useDoc((s) => s.doc.styles)
  const imagePicker = useImagePicker((src) => commit(set([...list, { type: 'image', src, fit: 'cover' }]), 'Remplissage image'))
  const ids = painted.map((n) => n.id)
  const fills = mixed(painted.map((n) => ('fills' in n ? n.fills : [])))
  const list = Array.isArray(fills) ? fills : []
  const set = (next: Fill[]) => setOps(ids, { fills: next })
  const replace = (i: number, fill: Fill) => set(list.map((f, k) => (k === i ? fill : f)))
  const remove = (i: number) => commit(set(list.filter((_, k) => k !== i)), 'Retirer un remplissage')
  // Le remplissage uni du dessus passe en dégradé ; sans remplissage uni, un dégradé est ajouté.
  const solid = list.findLastIndex((f) => !isGradient(f) && !isImageFill(f))
  const toGradientFill = () =>
    commit(
      solid >= 0 ? replace(solid, toGradient(list[solid] as Color, styles)) : set([...list, toGradient('#D9D9D9', styles)]),
      'Dégradé',
    )

  return (
    <Section
      title="Fill"
      actions={
        <>
          {fills !== 'mixed' && (
            <IconButton label="Switch to gradient" tooltip="Gradient" onClick={toGradientFill}>
              <GradientGlyph />
            </IconButton>
          )}
          {fills !== 'mixed' && images && (
            <IconButton label="Add image fill" tooltip="Image" onClick={imagePicker.pick}>
              <Icon d={IMAGE_GLYPH} />
            </IconButton>
          )}
          <IconButton label="Add fill" onClick={() => commit(set([...list, '#D9D9D9']), 'Ajouter un remplissage')}>
            <Icon d={PLUS} />
          </IconButton>
        </>
      }
    >
      {fills === 'mixed' ? (
        <button type="button" className="text-button" onClick={() => commit(set((painted[0] as { fills: Fill[] }).fills), 'Remplissage')}>
          Mixed fills — match the first one
        </button>
      ) : (
        list.map((f, i) =>
          isImageFill(f) ? (
            <ImageFillRow
              key={i}
              name={`Fill ${i + 1}`}
              fill={f}
              solid="#D9D9D9"
              apply={(fill) => commit(replace(i, fill), 'Remplissage image')}
              onRemove={() => remove(i)}
            />
          ) : isGradient(f) ? (
            <GradientRow
              key={i}
              name={`Fill ${i + 1}`}
              gradient={f}
              styles={styles}
              apply={(fill, phase) => applyPhase(replace(i, fill), phase, 'Dégradé')}
              opsFor={(fill) => replace(i, fill)}
              onRemove={() => remove(i)}
            />
          ) : (
            <ColorRow
              key={i}
              name={`Fill ${i + 1}`}
              color={f}
              styles={styles}
              apply={(color, phase) => applyPhase(replace(i, color), phase, 'Remplissage')}
              onRemove={() => remove(i)}
              onCreateStyle={(value) =>
                commit(
                  [
                    { op: 'style.color.set', id: '$style', name: `Color ${styles.colors.length + 1}`, value },
                    ...replace(i, { style: '$style' }),
                  ],
                  'Créer une couleur nommée',
                )
              }
            />
          ),
        )
      )}
      {imagePicker.element}
    </Section>
  )
}

const ALIGNS: { value: Stroke['align']; label: string }[] = [
  { value: 'inside', label: 'Inside' },
  { value: 'center', label: 'Center' },
  { value: 'outside', label: 'Outside' },
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
      title="Stroke"
      actions={
        current ? (
          <IconButton label="Remove stroke" onClick={() => commit(set(null), 'Retirer le contour')}><Icon d="M4 8h8" /></IconButton>
        ) : (
          <IconButton label="Add stroke" onClick={() => commit(set({ color: '#000000', width: 1, align: 'inside' }), 'Ajouter un contour')}>
            <Icon d={PLUS} />
          </IconButton>
        )
      }
    >
      {stroke === 'mixed' && <p className="empty-note">Mixed strokes.</p>}
      {current && (
        <>
          <ColorRow
            name="Stroke"
            color={current.color}
            styles={styles}
            apply={(color, phase) => applyPhase(set({ ...current, color }), phase, 'Contour')}
          />
          <div className="field-grid">
            <NumberField
              name="Stroke width"
              label={<Icon d={FIELD_GLYPH.stroke} />}
              min={0.5}
              step={1}
              value={current.width}
              onCommit={(v) => commit(set({ ...current, width: v }), 'Contour')}
              scrub={scrubWith('Contour', (v) => set({ ...current, width: Math.max(0.5, v) }))}
            />
            <Select
              label="Stroke position"
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
      title="Shadow"
      actions={
        <IconButton
          label="Add shadow"
          onClick={() => commit(set([...list, { x: 0, y: 4, blur: 12, spread: 0, color: '#00000026', inset: false }]), 'Ajouter une ombre')}
        >
          <Icon d={PLUS} />
        </IconButton>
      }
    >
      {shadows === 'mixed' && <p className="empty-note">Mixed shadows.</p>}
      {list.map((s, i) => {
        const n = i + 1
        const num = (key: 'x' | 'y' | 'blur' | 'spread', name: string, label: ReactNode, min?: number) => (
          <NumberField
            name={`Shadow ${n} ${name.toLowerCase()}`}
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
              {num('blur', 'Blur', <Icon d={FIELD_GLYPH.blur} />, 0)}
              {num('spread', 'Spread', <Icon d={FIELD_GLYPH.spread} />)}
            </div>
            <ColorRow
              name={`Shadow ${n}`}
              color={s.color}
              styles={styles}
              apply={(color, phase) => applyPhase(update(i, { color }), phase, 'Ombre')}
              onRemove={() => commit(set(list.filter((_, k) => k !== i)), 'Retirer une ombre')}
            />
            <Checkbox checked={s.inset} onChange={(inset) => commit(update(i, { inset }), 'Ombre')}>
              Inner shadow
            </Checkbox>
          </div>
        )
      })}
    </Section>
  )
}

/** Flous : du calque (layer blur) et de ce qui est derrière lui (background blur). 0 = aucun. */
export function EffectsSection() {
  const { nodes } = useSelection()
  if (nodes.length === 0 || nodes.some((n) => n.type === 'text' || n.type === 'icon')) return null
  const ids = nodes.map((n) => n.id)
  const value = (key: 'blur' | 'backgroundBlur') => {
    const v = mixed(nodes.map((n) => ('blur' in n || 'backgroundBlur' in n ? ((n as Blurs)[key] ?? 0) : 0)))
    return v === 'mixed' ? 'mixed' : v
  }
  const set = (key: 'blur' | 'backgroundBlur', v: number) => setOps(ids, { [key]: v > 0 ? Math.round(v * 10) / 10 : null })
  const field = (key: 'blur' | 'backgroundBlur', name: string, glyph: string, label: string) => (
    <NumberField
      name={name}
      label={<Icon d={glyph} />}
      title={name}
      min={0}
      value={value(key)}
      onCommit={(v) => commit(set(key, Math.max(0, v)), label)}
      scrub={scrubWith(label, (v) => set(key, Math.max(0, v)))}
    />
  )
  return (
    <Section title="Effects">
      <div className="field-grid">
        {field('blur', 'Layer blur', FIELD_GLYPH.blur, 'Flou')}
        {field('backgroundBlur', 'Background blur', BACKGROUND_BLUR_GLYPH, 'Flou d’arrière-plan')}
      </div>
    </Section>
  )
}

/** Glyphe « flou d'arrière-plan » : une goutte derrière une vitre. */
const BACKGROUND_BLUR_GLYPH = 'M2.5 2.5h11v11h-11zM8 5c1.3 1.7 2.5 3 2.5 4.4a2.5 2.5 0 0 1-5 0C5.5 8 6.7 6.7 8 5z'
