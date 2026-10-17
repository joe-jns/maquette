import { findNode } from '../../core/tree'
import type { Node } from '../../core/types'
import { runCommand } from '../state/commands'
import { docStore } from '../state/store'
import { uiStore } from '../state/ui'
import { SEPARATOR, type MenuAction, type MenuEntry } from '../ui/menuModel'
import { runCanvasCommand, type ScreenPoint } from './interaction'
import { shortcutKeys, type CommandId } from './shortcuts'

/**
 * Menus contextuels du canevas et des calques, comme Figma. Seulement des commandes qui existent
 * déjà (clavier, menu Fichier) : mêmes effets, mêmes raccourcis affichés.
 */

/** Raccourci de l'export 2× : celui du menu Fichier (src/main/menu.ts, CmdOrCtrl+Shift+E). */
const EXPORT_2X_KEYS = 'Ctrl+Maj+E'

const cmd = (label: string, id: CommandId, at?: ScreenPoint, extra: Partial<MenuAction> = {}): MenuAction => ({
  label,
  shortcut: shortcutKeys(id),
  onSelect: () => void runCanvasCommand(id, at),
  ...extra,
})

const selectedNodes = (): Node[] => {
  const doc = docStore.getState().doc
  return uiStore.getState().selection.map((id) => findNode(doc, id)?.node).filter((n): n is Node => !!n)
}

/** Masquer/Afficher, Verrouiller/Déverrouiller : pour toute la sélection d'un coup. */
function toggles(nodes: Node[]): MenuEntry[] {
  const allHidden = nodes.every((n) => !n.visible)
  const allLocked = nodes.every((n) => n.locked)
  const set = (patch: Partial<Pick<Node, 'visible' | 'locked'>>, label: string) => () =>
    docStore.getState().dispatch(nodes.map((n) => ({ op: 'update', id: n.id, set: patch })), label)
  return [
    { label: allHidden ? 'Afficher' : 'Masquer', onSelect: set({ visible: allHidden }, allHidden ? 'Afficher' : 'Masquer') },
    { label: allLocked ? 'Déverrouiller' : 'Verrouiller', onSelect: set({ locked: !allLocked }, allLocked ? 'Déverrouiller' : 'Verrouiller') },
  ]
}

/**
 * Menu d'une sélection (canevas ou calques). `at` : point du clic droit sur le canevas (« Coller ici ») ;
 * `rename` : renommage sur place, proposé dans les calques.
 */
export function selectionMenu({ at, rename }: { at?: ScreenPoint; rename?: () => void } = {}): MenuEntry[] {
  const nodes = selectedNodes()
  if (nodes.length === 0) return emptyCanvasMenu(at)
  const single = nodes.length === 1 ? nodes[0]! : null
  return [
    cmd('Copier', 'copy'),
    cmd('Couper', 'cut'),
    cmd(at ? 'Coller ici' : 'Coller', 'paste', at),
    cmd('Dupliquer', 'duplicate'),
    SEPARATOR,
    cmd('Mettre au premier plan', 'front'),
    cmd('Avancer d’un plan', 'forward'),
    cmd('Reculer d’un plan', 'backward'),
    cmd('Mettre à l’arrière-plan', 'back'),
    SEPARATOR,
    cmd('Mettre dans un cadre', 'wrapInFrame'),
    cmd('Mise en page automatique', 'addAutoLayout'),
    SEPARATOR,
    ...(rename && single ? [{ label: 'Renommer', onSelect: rename }] : []),
    ...toggles(nodes),
    SEPARATOR,
    {
      label: 'Exporter en PNG',
      submenu: [
        { label: '1×', onSelect: () => void runCommand('export-png-1') },
        { label: '2×', shortcut: EXPORT_2X_KEYS, onSelect: () => void runCommand('export-png-2') },
        { label: '3×', onSelect: () => void runCommand('export-png-3') },
      ],
    },
    ...(single?.type === 'frame' ? [cmd('Vérifier avec taste-skill', 'tasteCheck')] : []),
    SEPARATOR,
    cmd('Supprimer', 'delete', undefined, { danger: true }),
  ]
}

/** Clic droit dans le vide. */
export function emptyCanvasMenu(at?: ScreenPoint): MenuEntry[] {
  return [
    cmd(at ? 'Coller ici' : 'Coller', 'paste', at),
    cmd('Tout sélectionner', 'selectAll'),
    SEPARATOR,
    cmd('Tout voir', 'zoomFit'),
    cmd('Zoom à 100 %', 'zoom100'),
    SEPARATOR,
    cmd('Raccourcis clavier', 'help'),
  ]
}
