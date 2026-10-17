import type { ReactNode } from 'react'
import './select.css'

interface Props {
  /** `'mixed'` : sélection où certains éléments ont la case et d'autres non. */
  checked: boolean | 'mixed'
  onChange(checked: boolean): void
  children: ReactNode
  disabled?: boolean
}

/**
 * Case à cocher maison (Figma UI3) : carré de 16 px, coche fine, tiret pour l'état mixte ;
 * tout le libellé est cliquable, Espace la bascule, focus visible.
 */
export function Checkbox({ checked, onChange, children, disabled }: Props) {
  return (
    <label className={`checkbox${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        role="checkbox"
        className="checkbox-box"
        aria-checked={checked === 'mixed' ? 'mixed' : checked}
        disabled={disabled}
        onClick={() => onChange(checked !== true)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          {checked === true && <path d="M4 8.5 6.75 11 12 5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />}
          {checked === 'mixed' && <path d="M4.5 8h7" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />}
        </svg>
      </button>
      <span className="checkbox-label">{children}</span>
    </label>
  )
}
