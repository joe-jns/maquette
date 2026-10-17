import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { IconPicker } from '../panels/design/IconPicker'
import { uiStore, useUi, type Tool } from '../state/ui'
import { Icon, type IconName } from '../ui/icons'
import { QuickMenu } from '../ui/QuickMenu'
import { insertIcon } from './insertIcon'
import { shortcutKeys } from './shortcuts'

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
      data-tooltip={def.label}
      data-shortcut={shortcutKeys(`tool.${def.tool}`)}
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
  const group = useRef<HTMLDivElement>(null)

  // Une forme prise au clavier (R, O) devient aussi celle du groupe.
  useEffect(() => {
    const found = SHAPES.find((s) => s.tool === current)
    if (found) setShape(found)
  }, [current])

  return (
    <div className="tool-split" ref={group}>
      <ToolButton def={shape} current={current} />
      <button
        ref={chevron}
        type="button"
        className="tool-chevron"
        aria-label="Formes"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip="Formes"
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
          alignTo={group}
          label="Formes"
          placement="above"
          onClose={() => setOpen(false)}
          entries={[
            ...SHAPES.map((s) => ({
              id: s.tool,
              label: s.label,
              icon: s.icon,
              shortcut: s.key,
              checked: s.tool === shape.tool,
              onSelect: () => {
                setShape(s)
                uiStore.getState().setTool(s.tool)
              },
            })),
            'separator' as const,
            {
              id: 'icon',
              label: 'Icône…',
              icon: 'icon' as const,
              shortcut: shortcutKeys('insertIcon'),
              onSelect: () => uiStore.getState().setIconPicker(true),
            },
          ]}
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
  const picking = useUi((s) => s.iconPicker)
  const close = useCallback(() => uiStore.getState().setIconPicker(false), [])
  return (
    <div className="toolbar" role="toolbar" aria-label="Outils" data-ui data-tooltip-side="top" onKeyDown={keepButtonKeys}>
      {GROUPS.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <span className="toolbar-separator" aria-hidden />}
          {group.map((item) =>
            item === 'shapes' ? <ShapeGroup key="shapes" current={current} /> : <ToolButton key={item.tool} def={item} current={current} />,
          )}
        </Fragment>
      ))}
      {picking && (
        <IconPicker
          className="is-floating"
          label="Insérer une icône"
          onClose={close}
          onPick={(name) => {
            close()
            insertIcon(name)
          }}
        />
      )}
    </div>
  )
}
