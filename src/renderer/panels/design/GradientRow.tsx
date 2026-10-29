import { resolveColor } from '../../../core/css'
import type { Op } from '../../../core/ops'
import { gradientCss } from '../../../core/paint'
import type { Color, DocStyles, Fill, Gradient, GradientStop } from '../../../core/types'
import { ColorRow, type ColorPhase } from './ColorRow'
import { NumberField } from './NumberField'
import { Icon, scrubWith } from './shared'

const TYPES: { value: Gradient['type']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
  { value: 'conic', label: 'Conic' },
]

const ANGLE_GLYPH = 'M3 13h10M3 13 11 5M8.5 13a5.5 5.5 0 0 0-1.6-3.9'
const SOLID_GLYPH = 'M3.5 3.5h9v9h-9z'

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()

/** Couleur au milieu de deux arrêts (pour en ajouter un) : mélange des couleurs résolues. */
function mix(a: string, b: string): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const alpha = (h: string) => (h.length === 9 ? ch(h, 3) : 255)
  const rgb = [0, 1, 2].map((i) => hex2((ch(a, i) + ch(b, i)) / 2)).join('')
  const al = (alpha(a) + alpha(b)) / 2
  return `#${rgb}${al >= 255 ? '' : hex2(al)}`
}

/** Une couleur passée en dégradé (comme Figma) : la couleur, puis la même transparente. */
export function toGradient(color: Color, styles: DocStyles): Gradient {
  const hex = resolveColor(color, styles).slice(0, 7)
  return { type: 'linear', angle: 180, stops: [{ color, position: 0 }, { color: `${hex}00`, position: 1 }] }
}

/**
 * Un remplissage en dégradé dans le panneau : aperçu, type (linéaire, radial ou conique), angle, et les
 * arrêts (couleur, opacité, position), au moins deux.
 */
export function GradientRow({ name, gradient, styles, apply, onRemove, opsFor }: {
  name: string
  gradient: Gradient
  styles: DocStyles
  apply(fill: Fill, phase: ColorPhase): void
  onRemove(): void
  /** Opérations qui posent ce remplissage (glisser l'étiquette d'un champ). */
  opsFor(fill: Fill): Op[]
}) {
  const color = (c: Color) => resolveColor(c, styles)
  const preview = gradientCss(gradient, color)
  const stops = gradient.stops
  const withStops = (next: GradientStop[]): Gradient => ({ ...gradient, stops: next })
  const setStop = (k: number, patch: Partial<GradientStop>) => withStops(stops.map((s, i) => (i === k ? { ...s, ...patch } : s)))
  // L'angle passe d'un linéaire à un conique ; sinon celui par défaut du type (vers le bas, ou départ en haut).
  const setType = (type: Gradient['type']): Gradient => {
    if (type === 'radial') return { type, stops }
    return { type, angle: gradient.type === 'radial' ? (type === 'linear' ? 180 : 0) : gradient.angle, stops }
  }
  const angled = gradient.type === 'radial' ? null : gradient
  const label = gradient.type === 'linear' ? `Linear ${Math.round(gradient.angle)}°` : gradient.type === 'conic' ? `Conic ${Math.round(gradient.angle)}°` : 'Radial'

  const addStop = () => {
    // Au milieu du plus grand écart entre deux arrêts.
    let k = 0
    for (let i = 1; i < stops.length - 1; i++) {
      if (stops[i + 1]!.position - stops[i]!.position > stops[k + 1]!.position - stops[k]!.position) k = i
    }
    const a = stops[k]!
    const b = stops[k + 1]!
    const stop = { color: mix(color(a.color), color(b.color)), position: Math.round(((a.position + b.position) / 2) * 1000) / 1000 }
    apply(withStops([...stops.slice(0, k + 1), stop, ...stops.slice(k + 1)]), 'commit')
  }

  return (
    <div className="gradient-row" data-gradient={gradient.type}>
      <div className="color-row">
        <div className="color-box is-gradient">
          <span className="swatch" aria-hidden><span className="swatch-fill" style={{ backgroundImage: preview }} /></span>
          <span className="gradient-label">{label}</span>
        </div>
        <span className="color-row-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Solid color for ${name.toLowerCase()}`}
            data-tooltip="Solid color"
            onClick={() => apply(stops[0]!.color, 'commit')}
          >
            <Icon d={SOLID_GLYPH} />
          </button>
          <button type="button" className="icon-button" aria-label={`Remove ${name.toLowerCase()}`} data-tooltip="Remove" onClick={onRemove}>
            <Icon d="M4 8h8" />
          </button>
        </span>
      </div>
      <div className="field-grid">
        <div className="segmented" role="group" aria-label="Gradient type">
          {TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={gradient.type === t.value} onClick={() => apply(setType(t.value), 'commit')}>
              {t.label}
            </button>
          ))}
        </div>
        <NumberField
          name="Gradient angle"
          label={<Icon d={ANGLE_GLYPH} />}
          suffix="°"
          disabled={angled === null}
          value={angled ? angled.angle : null}
          onCommit={(v) => angled && apply({ ...angled, angle: ((v % 360) + 360) % 360 }, 'commit')}
          scrub={angled ? scrubWith('Dégradé', (v) => opsFor({ ...angled, angle: ((v % 360) + 360) % 360 })) : undefined}
        />
      </div>
      {stops.map((s, k) => (
        <div key={k} className="gradient-stop">
          <div className="stop-position">
            <NumberField
              name={`Stop ${k + 1} position`}
              label=""
              suffix="%"
              min={0}
              max={100}
              value={Math.round(s.position * 1000) / 10}
              onCommit={(v) => apply(setStop(k, { position: Math.min(100, Math.max(0, v)) / 100 }), 'commit')}
            />
          </div>
          <ColorRow
            name={`Stop ${k + 1}`}
            compact
            color={s.color}
            styles={styles}
            apply={(c, phase) => apply(setStop(k, { color: c }), phase)}
            onRemove={stops.length > 2 ? () => apply(withStops(stops.filter((_, i) => i !== k)), 'commit') : undefined}
          />
        </div>
      ))}
      <button type="button" className="text-button" onClick={addStop}>
        Add stop
      </button>
    </div>
  )
}
