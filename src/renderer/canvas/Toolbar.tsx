import { uiStore, useUi, type Tool } from '../state/ui'
import { shortcutKeys } from './shortcuts'

const TOOLS: { tool: Tool; label: string; icon: string }[] = [
  { tool: 'move', label: 'Déplacer', icon: 'M5 3l14 8-6 2-3 6z' },
  { tool: 'frame', label: 'Cadre', icon: 'M7 3v18M17 3v18M3 7h18M3 17h18' },
  { tool: 'rect', label: 'Rectangle', icon: 'M4 5h16v14H4z' },
  { tool: 'ellipse', label: 'Ellipse', icon: 'M12 5a8 7 0 1 0 0.01 0z' },
  { tool: 'text', label: 'Texte', icon: 'M5 5h14M12 5v14M9 19h6' },
]

/** Barre d'outils flottante en bas du canevas ; ses infobulles s'ouvrent au-dessus. */
export function Toolbar() {
  const current = useUi((s) => s.tool)
  return (
    <div className="toolbar" role="toolbar" aria-label="Outils" data-ui data-tooltip-side="top">
      {TOOLS.map(({ tool, label, icon }) => (
        <button
          key={tool}
          type="button"
          data-tool-button={tool}
          aria-pressed={current === tool}
          data-tooltip={label}
          data-shortcut={shortcutKeys(`tool.${tool}`)}
          onClick={() => uiStore.getState().setTool(tool)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="visually-hidden">{label}</span>
        </button>
      ))}
    </div>
  )
}
