import { useEffect, useMemo } from 'react'
import { applyDirectionOps, directionStyles, SECTORS, TONES } from '../../../taste/direction'
import { ensureFont } from '../../fonts/fontLoader'
import { docStore } from '../../state/store'
import { tasteStore, useTaste } from '../../taste/tasteStore'
import { Section } from '../design/shared'
import './direction.css'

/** Onglet Direction : tirer trois directions artistiques de taste-skill et appliquer la choisie. */
export function DirectionPanel() {
  const input = useTaste((s) => s.input)
  const options = useTaste((s) => s.options)
  const sheet = useTaste((s) => s.sheet)
  const busy = useTaste((s) => s.drawing)
  const error = useTaste((s) => s.drawError)
  const { setInput, drawOptions, choose } = tasteStore.getState()
  const styles = useMemo(() => (sheet ? directionStyles(sheet) : null), [sheet])
  // Les polices de la fiche sont chargées dès l'aperçu (« Ag » dans la bonne police).
  useEffect(() => {
    for (const font of styles?.fonts ?? []) void ensureFont(font.family)
  }, [styles])

  const apply = () => {
    if (!sheet || !styles) return
    const doc = docStore.getState().doc
    const name = sheet.direction?.name ?? 'taste-skill'
    docStore.getState().dispatch(applyDirectionOps(doc, styles), `Appliquer la direction ${name}`)
    for (const font of styles.fonts) void ensureFont(font.family)
  }

  return (
    <div className="design direction-panel">
      <Section title="Brief">
        <label className="select-field">
          <span>Secteur</span>
          <select aria-label="Secteur" value={input.sector} onChange={(e) => setInput({ sector: e.target.value })}>
            {SECTORS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Ton</span>
          <select aria-label="Ton" value={input.tone ?? ''} onChange={(e) => setInput({ tone: e.target.value || undefined })}>
            <option value="">Au hasard</option>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <textarea
          className="brief-field"
          aria-label="Brief en une phrase"
          placeholder="En une phrase : qui, quoi, pour qui."
          rows={2}
          value={input.brief}
          onChange={(e) => setInput({ brief: e.target.value })}
        />
        <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void drawOptions()}>
          {busy === 'options' ? 'Tirage…' : options ? 'Tirer 3 autres directions' : 'Tirer 3 directions'}
        </button>
        {error && <p className="error-note" role="alert">{error}</p>}
      </Section>

      {options && !sheet && (
        <Section title="Directions tirées">
          <ul className="direction-cards">
            {options.map((o) => (
              <li key={o.id} className="direction-card">
                <h4>{o.name}</h4>
                <p>{o.idea}</p>
                <p className="muted composition" title={o.composition}>{o.composition}</p>
                {o.needs && <p className="needs">Demande beaucoup d’images.</p>}
                <button type="button" className="secondary-button" disabled={busy !== null} aria-label={`Choisir ${o.name}`} onClick={() => void choose(o.id)}>
                  {busy === 'direction' ? 'Tirage…' : 'Choisir'}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sheet && styles && (
        <Section
          title={sheet.direction?.name ?? 'Direction'}
          actions={
            <button type="button" className="text-button" onClick={() => tasteStore.setState({ sheet: null })}>
              Retour
            </button>
          }
        >
          {sheet.direction?.idea && <p className="sheet-idea">{sheet.direction.idea}</p>}
          <div className="sheet-palette" aria-label="Palette">
            {styles.colors.map((c) => (
              <span key={c.name} className="sheet-chip" title={`${c.name} ${c.value}`}>
                <span className="sheet-swatch" style={{ background: c.value }} />
                <span>{c.name}</span>
              </span>
            ))}
          </div>
          <div className="sheet-fonts">
            {styles.fonts.map((f) => (
              <div key={f.family} className="sheet-font">
                <span className="sheet-ag" style={{ fontFamily: `"${f.family}", system-ui` }} aria-hidden>Ag</span>
                <span>{f.family}</span>
                <span className="muted">{f.source === 'fontshare' ? 'Fontshare' : 'Google Fonts'}</span>
              </div>
            ))}
          </div>
          {sheet.hero?.blueprint && (
            <details className="sheet-hero">
              <summary>Idée de hero : {sheet.hero.name}</summary>
              <p>{sheet.hero.blueprint}</p>
            </details>
          )}
          <button type="button" className="primary-button" onClick={apply}>Appliquer au document</button>
          <p className="muted small">Couleurs nommées et styles de texte ; Ctrl+Z retire tout d’un coup.</p>
        </Section>
      )}
    </div>
  )
}
