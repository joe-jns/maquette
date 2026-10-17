import { useUi } from '../state/ui'
import { PositionSection } from './design/PositionSection'
import './design/design.css'

/** Panneau droit : propriétés de la sélection, ou styles du document quand rien n'est sélectionné. */
export function RightPanel() {
  const count = useUi((s) => s.selection.length)
  return (
    <aside className="panel panel-right" data-testid="right-panel" data-ui aria-label="Propriétés">
      <div className="panel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true">Design</button>
      </div>
      {count > 0 ? (
        <div className="design" key="selection">
          <PositionSection />
        </div>
      ) : (
        <p className="empty-note">Sélectionnez un élément pour voir ses propriétés.</p>
      )}
    </aside>
  )
}
