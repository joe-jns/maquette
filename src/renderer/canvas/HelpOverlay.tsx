import { uiStore, useUi } from '../state/ui'
import { SHORTCUTS, type Shortcut } from './shortcuts'

const GROUPS: Shortcut['group'][] = ['Tools', 'Edit', 'Selection', 'Arrange', 'View']

/** Fenêtre d'aide « ? » générée depuis la table des raccourcis (une seule source de vérité). */
export function HelpOverlay() {
  const open = useUi((s) => s.helpOpen)
  if (!open) return null
  const close = () => uiStore.getState().setHelp(false)
  return (
    <div className="help-backdrop" data-ui onPointerDown={close}>
      <div
        className="help"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Keyboard shortcuts</h2>
          <button type="button" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="help-groups">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3>{group}</h3>
              <dl>
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.id}>
                    <dt>{s.label}</dt>
                    <dd><kbd>{s.keys}</kbd></dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
