import { useState } from 'react'
import type { TasteFinding } from '../../../shared/ipc'
import { RULE_IDS } from '../../../../vendor/taste-skill/scripts/lib/rules.mjs'
import { STATIC_ALLOW } from '../../../taste/rules'
import { locateFinding } from '../../../taste/locate'
import { shortcutKeys } from '../../canvas/shortcuts'
import { askClaude } from '../../chat/connect'
import { useChat } from '../../chat/chatStore'
import { useDoc } from '../../state/store'
import { uiStore } from '../../state/ui'
import { isFresh, tasteStore, useTaste } from '../../taste/tasteStore'
import { Section, useSelection } from './shared'
import '../direction/direction.css'

/** Les règles qu'on peut choisir d'ignorer (celles sans objet sur une maquette fixe le sont déjà). */
const RULES = RULE_IDS.filter((id) => !STATIC_ALLOW.includes(id))

/** Demande de correction envoyée au chat : les fautes choisies, avec la règle et la correction conseillée. */
export function fixRequest(frame: { id: string; name: string }, findings: { n: number; f: TasteFinding }[]): string {
  const lines = findings.map(({ n, f }) => `${n}. [${f.id}] ${f.message} — correction conseillée : ${f.fix}`)
  return [
    `Corrige ${findings.length > 1 ? 'ces problèmes' : 'ce problème'} relevé${findings.length > 1 ? 's' : ''} par le contrôle taste-skill sur le cadre « ${frame.name} » (${frame.id}) :`,
    ...lines,
    `Modifie les éléments existants (ne reconstruis pas la section), puis relance verifier_gout sur ${frame.id} pour confirmer.`,
  ].join('\n')
}

/** Contrôle taste-skill du cadre sélectionné : fautes numérotées, comme les épingles du canevas. */
export function CheckSection() {
  const { nodes } = useSelection()
  const doc = useDoc((s) => s.doc)
  const check = useTaste((s) => s.check)
  const checking = useTaste((s) => s.checking)
  const allow = useTaste((s) => s.allow)
  const error = useTaste((s) => s.checkError)
  const busy = useChat((s) => s.busy)
  // Fautes cochées (par leur rang) ; aucune = « tout corriger ».
  const [picked, setPicked] = useState<number[]>([])
  const frame = nodes.length === 1 && nodes[0]!.type === 'frame' ? nodes[0]! : null
  if (!frame) return null
  const run = check?.frameId === frame.id ? check : null
  const fresh = run !== null && isFresh(run)
  const { runCheck, toggleRule, ignorePageRules } = tasteStore.getState()
  const findings = run?.result.findings ?? []
  const chosen = picked.filter((i) => i < findings.length)
  const fix = () => {
    const list = (chosen.length ? chosen : findings.map((_, i) => i)).map((i) => ({ n: i + 1, f: findings[i]! }))
    if (askClaude(fixRequest(frame, list), [frame.id])) setPicked([])
  }

  return (
    <Section
      title="taste-skill check"
      actions={
        <button type="button" className="text-button" disabled={checking} data-tooltip="Check this frame with taste-skill" data-shortcut={shortcutKeys('tasteCheck')} onClick={() => void runCheck(frame.id)}>
          {checking ? 'Checking…' : run ? 'Check again' : 'Check'}
        </button>
      }
    >
      {error && !checking && <p className="error-note" role="alert">{error}</p>}
      {run && (
        <>
          <div className="check-summary">
            <span>
              {run.result.findings.length === 0
                ? 'No issues.'
                : `${run.result.findings.length} issue${run.result.findings.length > 1 ? 's' : ''}`}
            </span>
            {!fresh && <span className="check-badge">outdated</span>}
          </div>
          {findings.length > 0 && (
            <button
              type="button"
              className="fix-with-claude"
              disabled={busy}
              data-tooltip={busy ? 'Claude is answering: wait or press Stop' : 'Sends the issues to the Claude chat'}
              onClick={fix}
            >
              {chosen.length ? `Fix ${chosen.length} selected with Claude` : 'Fix all with Claude'}
            </button>
          )}
          {!run.result.isPage && (
            <p className="muted small">
              This frame is not a full page: some rules are about the first screen.{' '}
              <button type="button" className="text-button" onClick={ignorePageRules}>Ignore page rules</button>
            </p>
          )}
          <ol className="findings">
            {run.result.findings.map((f, i) => (
              <li key={`${f.id}-${i}`} className="finding-row">
                <input
                  type="checkbox"
                  className="finding-pick"
                  aria-label={`Pick issue ${i + 1} for Claude`}
                  checked={chosen.includes(i)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i] : p.filter((x) => x !== i)))}
                />
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
        <summary className="muted">Ignored rules ({allow.length})</summary>
        <div className="rule-list">
          {RULES.map((id) => (
            <button key={id} type="button" aria-pressed={allow.includes(id)} onClick={() => toggleRule(id)}>{id}</button>
          ))}
        </div>
      </details>
    </Section>
  )
}
