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

export function HexField({ name, value, onCommit }: { name: string; value: string; onCommit(hex: string): void }) {
  const shown = value.slice(1, 7)
  const [draft, setDraft] = useState(shown)
  const dirty = useRef(false)
  // Cible fixée à la première frappe (voir NumberField) : jamais appliquée à une autre sélection.
  const target = useRef<{ onCommit: (hex: string) => void; value: string } | null>(null)
  useEffect(() => {
    if (!dirty.current) setDraft(shown)
  }, [shown])
  const commit = () => {
    const to = target.current ?? { onCommit, value }
    target.current = null
    dirty.current = false
    const hex = normalizeColor(draft.startsWith('#') ? draft : `#${draft}`) ?? normalizeColor(draft)
    if (!hex) {
      setDraft(shown)
      return
    }
    // La saisie ne change que la teinte : l'opacité actuelle est gardée.
    to.onCommit(withAlpha(hex, alphaOf(to.value) * alphaOf(hex)))
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
        if (!dirty.current) target.current = { onCommit, value }
        dirty.current = true
        setDraft(e.target.value)
      }}
      onBlur={() => dirty.current && commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          dirty.current = false
          target.current = null
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
export function ColorRow({ name, color, styles, apply, onRemove, onCreateStyle, onGradient }: {
  name: string
  color: Color
  styles: DocStyles
  apply(color: Color, phase: ColorPhase): void
  onRemove?: () => void
  /** Crée une couleur nommée à partir de cette couleur et l'applique. */
  onCreateStyle?: (value: string) => void
  /** Passe ce remplissage en dégradé. */
  onGradient?: () => void
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

  const STYLES = 'M3.5 5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM9.5 5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM3.5 11a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM9.5 11a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0z'

  // Comme Figma : une seule boîte de 24 px (pastille, valeur, opacité), les actions au bout, au survol.
  return (
    <div className="color-row">
      {named ? (
        <div className="color-box is-named">
          <span className="swatch" style={{ background: value }} aria-hidden />
          <span className="style-chip" data-tooltip={value}>{named.name}</span>
        </div>
      ) : (
        <div className="color-box">
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
        </div>
      )}
      <span className="color-row-actions">
        {named && (
          <button type="button" className="icon-button" aria-label="Détacher la couleur nommée" data-tooltip="Détacher la couleur nommée" onClick={() => apply(value, 'commit')}>
            <Icon d="M6 10 10 6M5 7.5 3.5 9a2.5 2.5 0 0 0 3.5 3.5L8.5 11M11 8.5 12.5 7A2.5 2.5 0 0 0 9 3.5L7.5 5" />
          </button>
        )}
        {!named && onCreateStyle && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Créer une couleur nommée depuis le ${lower(name)}`}
            title="Créer une couleur nommée"
            onClick={() => onCreateStyle(value)}
          >
            <Icon d="M8 3v10M3 8h10" />
          </button>
        )}
        {onGradient && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Dégradé pour le ${lower(name)}`}
            data-tooltip="Dégradé"
            onClick={onGradient}
          >
            <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
              <defs>
                <linearGradient id="glyph-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="currentColor" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="url(#glyph-gradient)" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={`Couleur nommée pour le ${lower(name)}`}
          title="Couleurs nommées"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <Icon d={STYLES} />
        </button>
        {onRemove && (
          <button type="button" className="icon-button" aria-label={`Retirer : ${lower(name)}`} data-tooltip="Retirer" onClick={onRemove}>
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
