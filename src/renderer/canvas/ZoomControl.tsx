import { useRef, useState } from 'react'
import { uiStore, useUi } from '../state/ui'
import { Icon } from '../ui/icons'
import { QuickMenu } from '../ui/QuickMenu'
import { fitTo, selectionExists, zoomAroundCenter, zoomStep } from './camera-actions'
import { keepButtonKeys } from './Toolbar'

export const formatZoom = (zoom: number) => `${Math.round(zoom * 100)} %`

/** Pilule de zoom en bas à droite (comme Pen) : − 79 % +, le pourcentage ouvre le menu du zoom. */
export function ZoomControl() {
  const zoom = useUi((s) => s.camera.zoom)
  const hasSelection = useUi((s) => s.selection.length > 0)
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <div className="zoom-control" data-ui onKeyDown={keepButtonKeys}>
      <button type="button" className="zoom-step" aria-label="Zoom arrière" title="Zoom arrière (Ctrl+-)" onClick={() => zoomStep(-1)}>
        <Icon name="minus" size={16} />
      </button>
      <button
        ref={button}
        type="button"
        className="zoom-value"
        data-testid="zoom"
        aria-label={`Zoom : ${formatZoom(zoom)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {formatZoom(zoom)}
      </button>
      <button type="button" className="zoom-step" aria-label="Zoom avant" title="Zoom avant (Ctrl++)" onClick={() => zoomStep(1)}>
        <Icon name="plus" size={16} />
      </button>
      {open && (
        <QuickMenu
          anchor={button}
          label="Zoom"
          placement="above"
          align="end"
          onClose={() => setOpen(false)}
          entries={[
            { id: 'zoom-in', label: 'Zoom avant', shortcut: 'Ctrl++', onSelect: () => zoomStep(1) },
            { id: 'zoom-out', label: 'Zoom arrière', shortcut: 'Ctrl+-', onSelect: () => zoomStep(-1) },
            'separator',
            { id: 'zoom-fit', label: 'Ajuster à l’écran', shortcut: 'Maj+1', onSelect: () => fitTo('all', 220) },
            {
              id: 'zoom-selection',
              label: 'Zoom sur la sélection',
              shortcut: 'Maj+2',
              disabled: !hasSelection,
              onSelect: () => {
                if (selectionExists()) fitTo(uiStore.getState().selection, 220)
              },
            },
            'separator',
            { id: 'zoom-50', label: 'Zoom à 50 %', onSelect: () => zoomAroundCenter(0.5) },
            { id: 'zoom-100', label: 'Zoom à 100 %', shortcut: 'Ctrl+0', onSelect: () => zoomAroundCenter(1) },
            { id: 'zoom-200', label: 'Zoom à 200 %', onSelect: () => zoomAroundCenter(2) },
          ]}
        />
      )}
    </div>
  )
}
