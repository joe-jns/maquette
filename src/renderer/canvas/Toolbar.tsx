import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { uiStore, useUi, type Tool } from '../state/ui'
import { Icon, type IconName } from '../ui/icons'
import { QuickMenu } from '../ui/QuickMenu'

interface ToolDef { tool: Tool; label: string; key: string; icon: IconName }

const MOVE: ToolDef = { tool: 'move', label: 'Déplacer', key: 'V', icon: 'move' }
const FRAME: ToolDef = { tool: 'frame', label: 'Cadre', key: 'F', icon: 'frame' }
const SHAPES: ToolDef[] = [
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: 'rect' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: 'ellipse' },
]
const TEXT: ToolDef = { tool: 'text', label: 'Texte', key: 'T', icon: 'text' }

/** Groupes séparés par un trait : sélection | création (cadre, formes, texte). */
const GROUPS: (ToolDef | 'shapes')[][] = [[MOVE], [FRAME, 'shapes', TEXT]]

function ToolButton({ def, current }: { def: ToolDef; current: Tool }) {
  return (
    <button
      type="button"
      className="tool-button"
      data-tool-button={def.tool}
      aria-pressed={current === def.tool}
      title={`${def.label} (${def.key})`}
      onClick={() => uiStore.getState().setTool(def.tool)}
    >
      <Icon name={def.icon} />
      <span className="visually-hidden">{def.label}</span>
    </button>
  )
}

/** Outil de forme, avec son chevron qui ouvre la liste des formes ; la dernière forme choisie reste affichée. */
function ShapeGroup({ current }: { current: Tool }) {
  const [shape, setShape] = useState<ToolDef>(SHAPES[0]!)
  const [open, setOpen] = useState(false)
  const chevron = useRef<HTMLButtonElement>(null)

  // Une forme prise au clavier (R, O) devient aussi celle du groupe.
  useEffect(() => {
    const found = SHAPES.find((s) => s.tool === current)
    if (found) setShape(found)
  }, [current])

  return (
    <div className="tool-split">
      <ToolButton def={shape} current={current} />
      <button
        ref={chevron}
        type="button"
        className="tool-chevron"
        aria-label="Formes"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Formes"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }
        }}
      >
        <Icon name="chevronDownSmall" size={16} />
      </button>
      {open && (
        <QuickMenu
          anchor={chevron}
          label="Formes"
          placement="above"
          onClose={() => setOpen(false)}
          entries={SHAPES.map((s) => ({
            id: s.tool,
            label: s.label,
            icon: s.icon,
            shortcut: s.key,
            checked: s.tool === shape.tool,
            onSelect: () => {
              setShape(s)
              uiStore.getState().setTool(s.tool)
            },
          }))}
        />
      )}
    </div>
  )
}

/**
 * Entrée et Espace sur un bouton posé sur le canevas : le bouton s'active, le canevas ne les voit pas
 * (sinon Entrée « sélectionne les enfants » et Espace passe en mode main).
 */
export function keepButtonKeys(e: KeyboardEvent<HTMLElement>): void {
  if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('button')) e.stopPropagation()
}

/** Barre d'outils flottante en bas du canevas, centrée (Figma UI3). */
export function Toolbar() {
  const current = useUi((s) => s.tool)
  return (
    <div className="toolbar" role="toolbar" aria-label="Outils" data-ui onKeyDown={keepButtonKeys}>
      {GROUPS.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <span className="toolbar-separator" aria-hidden />}
          {group.map((item) =>
            item === 'shapes' ? <ShapeGroup key="shapes" current={current} /> : <ToolButton key={item.tool} def={item} current={current} />,
          )}
        </Fragment>
      ))}
    </div>
  )
}
