/** Panneau droit : propriétés de la sélection, ou styles du document quand rien n'est sélectionné. */
export function RightPanel() {
  return (
    <aside className="panel panel-right" data-testid="right-panel" data-ui aria-label="Propriétés">
      <div className="panel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true">Design</button>
      </div>
    </aside>
  )
}
