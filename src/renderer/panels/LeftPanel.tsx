import { PagesPanel } from './PagesPanel'

/** Panneau gauche : pages, puis calques de la page affichée. */
export function LeftPanel() {
  return (
    <aside className="panel panel-left" data-testid="left-panel" data-ui aria-label="Pages et calques">
      <PagesPanel />
    </aside>
  )
}
