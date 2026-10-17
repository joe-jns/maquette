import { useUi } from '../state/ui'
import { tasteStore, useTaste, type PanelTab } from '../taste/tasteStore'
import { AutoLayoutSection } from './design/AutoLayoutSection'
import { CheckSection } from './design/CheckSection'
import { DocumentPanel } from './design/DocumentPanel'
import { FillSection, ShadowSection, StrokeSection } from './design/PaintSections'
import { PositionSection } from './design/PositionSection'
import { TextSection } from './design/TextSection'
import { DirectionPanel } from './direction/DirectionPanel'
import './design/design.css'

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'direction', label: 'Direction' },
]

/** Panneau droit : propriétés de la sélection (ou styles du document), et direction artistique. */
export function RightPanel() {
  const count = useUi((s) => s.selection.length)
  const tab = useTaste((s) => s.tab)
  return (
    <aside className="panel panel-right" data-testid="right-panel" data-ui aria-label="Propriétés">
      <div className="panel-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => tasteStore.getState().setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'direction' ? (
        <DirectionPanel />
      ) : count > 0 ? (
        <div className="design" key="selection">
          <PositionSection />
          <AutoLayoutSection />
          <TextSection />
          <FillSection />
          <StrokeSection />
          <ShadowSection />
          <CheckSection />
        </div>
      ) : (
        <DocumentPanel />
      )}
    </aside>
  )
}
