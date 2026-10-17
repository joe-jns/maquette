import { useEffect, useRef, useState } from 'react'
import { normalizeColor } from '../../../core/color'
import { resolveColor } from '../../../core/css'
import type { Color, DocStyles } from '../../../core/types'
import { NumberField } from './NumberField'
import { Icon } from './shared'

/** `preview` pendant qu'on cherche dans le sélecteur natif, `commit` pour valider (une annulation). */
export type ColorPhase = 'preview' | 'commit'

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const alphaOf = (hex: string) => (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1)
const withAlpha = (hex: string, alpha: number) => {
  const base = hex.slice(0, 7).toUpperCase()
  return alpha >= 1 ? base : base + Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()
}

function HexField({ name, value, onCommit }: { name: string; value: string; onCommit(hex: string): void }) {
  const shown = value.slice(1, 7)
  const [draft, setDraft] = useState(shown)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) setDraft(shown)
  }, [shown])
  const commit = () => {
    dirty.current = false
    const hex = normalizeColor(draft.startsWith('#') ? draft : `#${draft}`) ?? normalizeColor(draft)
    if (!hex) {
      setDraft(shown)
      return
    }
    // La saisie ne change que la teinte : l'opacité actuelle est gardée.
    onCommit(withAlpha(hex, alphaOf(value) * alphaOf(hex)))
  }
  return (
    <input
      className="hex-field"
      type="text"
      aria-label={name}
      value={draft}
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        dirty.current = true
        setDraft(e.target.value)
      }}
      onBlur={() => dirty.current && commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          dirty.current = false
          setDraft(shown)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/**
 * Une couleur du panneau : pastille (sélecteur natif), valeur hexadécimale, opacité, ou bien une
 * couleur nommée (pastille + nom, « détacher »). Choisir une couleur nommée ouvre la liste du document.
 */
export function ColorRow({ name, color, styles, apply, onRemove }: {
  name: string
  color: Color
  styles: DocStyles
  apply(color: Color, phase: ColorPhase): void
  onRemove?: () => void
}) {
  const value = resolveColor(color, styles)
  const named = typeof color === 'object' ? styles.colors.find((s) => s.id === color.style) : undefined
  const [picking, setPicking] = useState(false)
  const swatch = useRef<HTMLInputElement>(null)
  const live = useRef(false)

  // Le sélecteur natif : aperçu pendant la recherche, validation à la fermeture (événement « change »).
  useEffect(() => {
    const el = swatch.current
    if (!el) return
    const onChange = () => {
      live.current = false
      apply(withAlpha(el.value, alphaOf(value)), 'commit')
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [apply, value])

  return (
    <div className="color-row">
      {named ? (
        <>
          <span className="swatch" style={{ background: value }} aria-hidden />
          <span className="style-chip" title={value}>{named.name}</span>
          <button type="button" className="icon-button small" aria-label="Détacher la couleur nommée" title="Détacher la couleur nommée" onClick={() => apply(value, 'commit')}>
            <Icon d="M6 10 10 6M5 7.5 3.5 9a2.5 2.5 0 0 0 3.5 3.5L8.5 11M11 8.5 12.5 7A2.5 2.5 0 0 0 9 3.5L7.5 5" />
          </button>
        </>
      ) : (
        <>
          <span className="swatch" style={{ background: value }}>
            <input
              ref={swatch}
              type="color"
              aria-label={`Sélecteur de couleur : ${lower(name)}`}
              value={value.slice(0, 7).toLowerCase()}
              onInput={(e) => {
                live.current = true
                apply(withAlpha(e.currentTarget.value, alphaOf(value)), 'preview')
              }}
            />
          </span>
          <HexField name={name} value={value} onCommit={(hex) => apply(hex, 'commit')} />
          <div className="alpha-field">
            <NumberField
              name={`Opacité du ${lower(name)}`}
              label=""
              suffix="%"
              min={0}
              max={100}
              value={Math.round(alphaOf(value) * 100)}
              onCommit={(v) => apply(withAlpha(value, v / 100), 'commit')}
            />
          </div>
        </>
      )}
      <span className="color-row-actions">
        <button
          type="button"
          className="icon-button small"
          aria-label={`Couleur nommée pour le ${lower(name)}`}
          title="Couleurs nommées"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <Icon d="M3 4h10M3 8h10M3 12h6" />
        </button>
        {onRemove && (
          <button type="button" className="icon-button small" aria-label={`Retirer : ${lower(name)}`} title="Retirer" onClick={onRemove}>
            <Icon d="M4 8h8" />
          </button>
        )}
      </span>
      {picking && (
        <div className="style-picker" role="listbox" aria-label="Couleurs nommées">
          {styles.colors.length === 0 && <p className="empty-note">Aucune couleur nommée dans ce document.</p>}
          {styles.colors.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={named?.id === s.id}
              onClick={() => {
                setPicking(false)
                apply({ style: s.id }, 'commit')
              }}
            >
              <span className="swatch" style={{ background: s.value }} aria-hidden />
              {s.name}
              <span className="style-value">{s.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
