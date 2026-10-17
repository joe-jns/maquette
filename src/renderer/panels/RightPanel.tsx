import { chatStore, useChat } from '../chat/chatStore'
import { shortcutKeys } from '../canvas/shortcuts'
import { useUi } from '../state/ui'
import { tasteStore, useTaste, type PanelTab } from '../taste/tasteStore'
import { AutoLayoutSection } from './design/AutoLayoutSection'
import { CheckSection } from './design/CheckSection'
import { DocumentPanel } from './design/DocumentPanel'
import { IconSection } from './design/IconSection'
import { FillSection, ShadowSection, StrokeSection } from './design/PaintSections'
import { PositionSection } from './design/PositionSection'
import { SelectionHeader } from './design/SelectionHeader'
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
  const chatOpen = useChat((s) => s.open)
  return (
    <aside className="panel panel-right" data-testid="right-panel" data-ui aria-label="Propriétés">
      <div className="panel-tabs">
        <div className="panel-tablist" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => tasteStore.getState().setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chat-open"
          aria-pressed={chatOpen}
          data-tooltip="Chat avec Claude"
          data-shortcut={shortcutKeys('toggleChat')}
          onClick={() => chatStore.getState().toggle()}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M5 5h14v10H10l-4 4v-4H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          Claude
        </button>
      </div>
      {tab === 'direction' ? (
        <DirectionPanel />
      ) : count > 0 ? (
        <div className="design" key="selection">
          <SelectionHeader />
          <PositionSection />
          <AutoLayoutSection />
          <TextSection />
          <IconSection />
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
