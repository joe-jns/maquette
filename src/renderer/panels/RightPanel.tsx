import { useUi } from '../state/ui'
import { AutoLayoutSection } from './design/AutoLayoutSection'
import { CheckSection } from './design/CheckSection'
import { IconSection } from './design/IconSection'
import { EffectsSection, FillSection, ShadowSection, StrokeSection } from './design/PaintSections'
import { PositionSection } from './design/PositionSection'
import { SelectionHeader } from './design/SelectionHeader'
import { TextSection } from './design/TextSection'
import './design/design.css'

/** Panneau droit : uniquement les propriétés de la sélection. Variables et Direction sont dans la barre du bas. */
export function RightPanel() {
  const count = useUi((s) => s.selection.length)
  return (
    <aside className="panel panel-right" data-testid="right-panel" data-ui aria-label="Properties">
      <div className="panel-tabs">
        <h2 className="panel-title">Design</h2>
      </div>
      {count > 0 ? (
        <div className="design" key="selection">
          <SelectionHeader />
          <PositionSection />
          <AutoLayoutSection />
          <TextSection />
          <IconSection />
          <FillSection />
          <StrokeSection />
          <ShadowSection />
          <EffectsSection />
          <CheckSection />
        </div>
      ) : (
        <p className="empty-note panel-empty">Select a layer to edit its properties.</p>
      )}
    </aside>
  )
}
