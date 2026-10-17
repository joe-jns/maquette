import { useEffect, useMemo, useRef, useState } from 'react'
import type { TextStyle } from '../../../core/types'
import { ensureFont, useFontCatalog } from '../../fonts/fontLoader'
import { useDoc } from '../../state/store'
import type { Op } from '../../../core/ops'
import { HexField } from './ColorRow'
import { applyPhase } from './PaintSections'
import { NumberField } from './NumberField'
import { commit, FIELD_GLYPH, Icon, IconButton, Section } from './shared'
import { Select } from '../../ui/Select'
import { FontPicker, SYSTEM_FONTS, weightOptions, weightsOf } from './TextSection'

/** Sélecteur natif d'une couleur nommée : aperçu en direct, une seule entrée d'historique à la fermeture. */
function StyleColorInput({ label, value, opsFor }: { label: string; value: string; opsFor(value: string): Op[] }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = () => applyPhase(opsFor(el.value), 'commit', 'Couleur nommée')
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [opsFor])
  return (
    <input
      ref={ref}
      type="color"
      aria-label={label}
      value={value.slice(0, 7).toLowerCase()}
      onInput={(e) => applyPhase(opsFor(e.currentTarget.value), 'preview', 'Couleur nommée')}
      onChange={() => undefined}
    />
  )
}

/** Champ texte qui ne valide que ce qui a été tapé (vide = ancienne valeur). */
function NameField({ name, value, onCommit }: { name: string; value: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])
  const commitDraft = () => {
    dirty.current = false
    const v = draft.trim()
    if (v && v !== value) onCommit(v)
    else setDraft(value)
  }
  return (
    <input
      className="name-field"
      type="text"
      aria-label={name}
      value={draft}
      spellCheck={false}
      onChange={(e) => {
        dirty.current = true
        setDraft(e.target.value)
      }}
      onBlur={() => dirty.current && commitDraft()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitDraft()
        if (e.key === 'Escape') {
          dirty.current = false
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

type TextProps = Omit<TextStyle, 'id' | 'name'>
const textProps = (s: TextStyle): TextProps => ({
  fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
})

/** Quand rien n'est sélectionné : les styles du document (couleurs nommées, styles de texte). */
export function DocumentPanel() {
  const styles = useDoc((s) => s.doc.styles)
  const catalog = useFontCatalog()
  const [picking, setPicking] = useState<string | null>(null)
  const fullCatalog = useMemo(() => {
    const known = new Set((catalog ?? []).map((f) => f.family))
    return [...(catalog ?? []), ...SYSTEM_FONTS.filter((f) => !known.has(f.family))].sort((a, b) => a.family.localeCompare(b.family))
  }, [catalog])

  const setText = (s: TextStyle, patch: Partial<TextProps & { name: string }>) =>
    commit([{ op: 'style.text.set', id: s.id, name: patch.name ?? s.name, ...textProps(s), ...patch }], 'Style de texte')

  return (
    <div className="design">
      <Section
        title="Couleurs nommées"
        actions={
          <IconButton
            label="Ajouter une couleur nommée"
            onClick={() => commit([{ op: 'style.color.set', name: `Couleur ${styles.colors.length + 1}`, value: '#0D99FF' }], 'Ajouter une couleur nommée')}
          >
            <Icon d="M8 3v10M3 8h10" />
          </IconButton>
        }
      >
        {styles.colors.length === 0 && <p className="empty-note inline">Aucune. Une couleur nommée change partout à la fois.</p>}
        {styles.colors.map((c, i) => (
          <div key={c.id} className="style-row">
            <span className="swatch" style={{ background: c.value }}>
              <StyleColorInput
                label={`Sélecteur de la couleur ${i + 1}`}
                value={c.value}
                opsFor={(value) => [{ op: 'style.color.set', id: c.id, name: c.name, value }]}
              />
            </span>
            <NameField
              name={`Nom de la couleur ${i + 1}`}
              value={c.name}
              onCommit={(name) => commit([{ op: 'style.color.set', id: c.id, name, value: c.value }], 'Renommer la couleur')}
            />
            <HexField
              name={`Couleur nommée ${i + 1}`}
              value={c.value}
              onCommit={(value) => commit([{ op: 'style.color.set', id: c.id, name: c.name, value }], 'Couleur nommée')}
            />
            <button
              type="button"
              className="icon-button small"
              aria-label={`Supprimer la couleur nommée ${c.name}`}
              data-tooltip="Supprimer (les éléments gardent la couleur)"
              onClick={() => commit([{ op: 'style.delete', id: c.id }], 'Supprimer la couleur nommée')}
            >
              <Icon d="M4 8h8" />
            </button>
          </div>
        ))}
      </Section>

      <Section
        title="Styles de texte"
        actions={
          <IconButton
            label="Ajouter un style de texte"
            onClick={() =>
              commit(
                [{ op: 'style.text.set', name: `Texte ${styles.text.length + 1}`, fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 16, lineHeight: 24, letterSpacing: 0 }],
                'Ajouter un style de texte',
              )
            }
          >
            <Icon d="M8 3v10M3 8h10" />
          </IconButton>
        }
      >
        {styles.text.length === 0 && <p className="empty-note inline">Aucun. Un style de texte réunit police, taille et interligne.</p>}
        {styles.text.map((s, i) => (
          <div key={s.id} className="text-style-block">
            <div className="style-row">
              <span className="text-style-preview" style={{ fontFamily: `"${s.fontFamily}", system-ui`, fontWeight: s.fontWeight }} aria-hidden>Ag</span>
              <NameField name={`Nom du style ${i + 1}`} value={s.name} onCommit={(name) => setText(s, { name })} />
              <button
                type="button"
                className="icon-button small"
                aria-label={`Supprimer le style de texte ${s.name}`}
                data-tooltip="Supprimer (les textes gardent leur mise en forme)"
                onClick={() => commit([{ op: 'style.delete', id: s.id }], 'Supprimer le style de texte')}
              >
                <Icon d="M4 8h8" />
              </button>
            </div>
            <div className="font-row">
              <button type="button" className="font-button" data-font-trigger aria-label={`Police du style ${i + 1}`} onClick={() => setPicking(picking === s.id ? null : s.id)}>
                <span style={{ fontFamily: `"${s.fontFamily}", system-ui` }}>{s.fontFamily}</span>
                <Icon d="M5 6.5 8 9.5l3-3" />
              </button>
              {picking === s.id && (
                <FontPicker
                  current={s.fontFamily}
                  catalog={fullCatalog}
                  onClose={() => setPicking(null)}
                  onPick={(fontFamily) => {
                    setPicking(null)
                    void ensureFont(fontFamily)
                    // Garder la graisse disponible la plus proche dans la nouvelle police.
                    const available = weightsOf(fullCatalog.find((f) => f.family === fontFamily))
                    const fontWeight = available.reduce((best, w) => (Math.abs(w - s.fontWeight) < Math.abs(best - s.fontWeight) ? w : best), available[0] ?? 400)
                    setText(s, { fontFamily, fontWeight })
                  }}
                />
              )}
            </div>
            <div className="field-grid">
              <Select
                label={`Graisse du style ${i + 1}`}
                value={String(s.fontWeight)}
                options={weightOptions(weightsOf(fullCatalog.find((f) => f.family === s.fontFamily)))}
                onChange={(v) => setText(s, { fontWeight: Number(v) })}
              />
              <NumberField name={`Taille du style ${i + 1}`} label={<Icon d={FIELD_GLYPH.fontSize} />} min={1} value={s.fontSize} onCommit={(fontSize) => setText(s, { fontSize })} />
              <NumberField name={`Interligne du style ${i + 1}`} label={<Icon d={FIELD_GLYPH.lineHeight} />} min={1} value={s.lineHeight} onCommit={(lineHeight) => setText(s, { lineHeight })} />
              <NumberField name={`Espacement du style ${i + 1}`} label={<Icon d={FIELD_GLYPH.letterSpacing} />} step={0.1} value={s.letterSpacing} onCommit={(letterSpacing) => setText(s, { letterSpacing })} />
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}
