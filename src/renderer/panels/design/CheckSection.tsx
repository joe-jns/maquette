import { RULE_IDS } from '../../../../vendor/taste-skill/scripts/lib/rules.mjs'
import { STATIC_ALLOW } from '../../../taste/rules'
import { locateFinding } from '../../../taste/locate'
import { shortcutKeys } from '../../canvas/shortcuts'
import { useDoc } from '../../state/store'
import { uiStore } from '../../state/ui'
import { isFresh, tasteStore, useTaste } from '../../taste/tasteStore'
import { Section, useSelection } from './shared'
import '../direction/direction.css'

/** Les règles qu'on peut choisir d'ignorer (celles sans objet sur une maquette fixe le sont déjà). */
const RULES = RULE_IDS.filter((id) => !STATIC_ALLOW.includes(id))

/** Contrôle taste-skill du cadre sélectionné : fautes numérotées, comme les épingles du canevas. */
export function CheckSection() {
  const { nodes } = useSelection()
  const doc = useDoc((s) => s.doc)
  const check = useTaste((s) => s.check)
  const checking = useTaste((s) => s.checking)
  const allow = useTaste((s) => s.allow)
  const error = useTaste((s) => s.checkError)
  const frame = nodes.length === 1 && nodes[0]!.type === 'frame' ? nodes[0]! : null
  if (!frame) return null
  const run = check?.frameId === frame.id ? check : null
  const fresh = run !== null && isFresh(run)
  const { runCheck, toggleRule, ignorePageRules } = tasteStore.getState()

  return (
    <Section
      title="Contrôle taste-skill"
      actions={
        <button type="button" className="text-button" disabled={checking} data-tooltip="Vérifier le cadre avec taste-skill" data-shortcut={shortcutKeys('tasteCheck')} onClick={() => void runCheck(frame.id)}>
          {checking ? 'Vérification…' : run ? 'Revérifier' : 'Vérifier'}
        </button>
      }
    >
      {error && !checking && <p className="error-note" role="alert">{error}</p>}
      {run && (
        <>
          <div className="check-summary">
            <span>
              {run.result.findings.length === 0
                ? 'Aucune faute.'
                : `${run.result.findings.length} faute${run.result.findings.length > 1 ? 's' : ''}`}
            </span>
            {!fresh && <span className="check-badge">à revérifier</span>}
          </div>
          {!run.result.isPage && (
            <p className="muted small">
              Ce cadre n’est pas une page entière : certaines règles parlent du premier écran.{' '}
              <button type="button" className="text-button" onClick={ignorePageRules}>Ignorer les règles de page</button>
            </p>
          )}
          <ol className="findings">
            {run.result.findings.map((f, i) => (
              <li key={`${f.id}-${i}`}>
                <button type="button" className="finding" onClick={() => uiStore.getState().select([locateFinding(doc, frame.id, f.message)])}>
                  <span className={`pin-number ${f.level === 'FAIL' ? 'is-fail' : 'is-warn'}`}>{i + 1}</span>
                  <strong>{f.id}</strong>
                  <span className="message">{f.message}</span>
                  <span className="fix">{f.fix}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <details>
        <summary className="muted">Règles ignorées ({allow.length})</summary>
        <div className="rule-list">
          {RULES.map((id) => (
            <button key={id} type="button" aria-pressed={allow.includes(id)} onClick={() => toggleRule(id)}>{id}</button>
          ))}
        </div>
      </details>
    </Section>
  )
}
