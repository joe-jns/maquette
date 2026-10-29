/**
 * Raccourcis clavier du canevas. Module pur : ni React ni DOM.
 *
 * Indépendant de la disposition du clavier : les lettres se comparent sur `key` (la lettre tapée,
 * donc AZERTY et QWERTY suivent la lettre), les chiffres et crochets sur `code` (la touche physique).
 */

export type CommandId =
  | 'tool.move' | 'tool.frame' | 'tool.rect' | 'tool.ellipse' | 'tool.text'
  | 'undo' | 'redo' | 'delete' | 'duplicate' | 'copy' | 'paste' | 'cut'
  | 'selectAll' | 'escape' | 'enter' | 'parent' | 'nextSibling' | 'prevSibling'
  | 'wrapInFrame' | 'addAutoLayout' | 'forward' | 'backward' | 'front' | 'back'
  | 'zoomIn' | 'zoomOut' | 'zoom100' | 'zoomFit' | 'zoomSelection'
  | 'nudgeLeft' | 'nudgeRight' | 'nudgeUp' | 'nudgeDown'
  | 'nudgeLeft10' | 'nudgeRight10' | 'nudgeUp10' | 'nudgeDown10'
  | 'help' | 'tasteCheck' | 'toggleChat' | 'insertIcon' | 'createComponent'

export interface Shortcut {
  id: CommandId
  keys: string
  label: string
  group: 'Tools' | 'Edit' | 'Selection' | 'Arrange' | 'View'
}

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Table lisible (aide, menus). Le `Record` garantit une entrée par commande. */
const TABLE: Record<CommandId, Omit<Shortcut, 'id'>> = {
  'tool.move': { keys: 'V', label: 'Move', group: 'Tools' },
  'tool.frame': { keys: 'F', label: 'Frame', group: 'Tools' },
  'tool.rect': { keys: 'R', label: 'Rectangle', group: 'Tools' },
  'tool.ellipse': { keys: 'O', label: 'Ellipse', group: 'Tools' },
  'tool.text': { keys: 'T', label: 'Text', group: 'Tools' },
  insertIcon: { keys: 'Shift+I', label: 'Insert icon', group: 'Tools' },

  undo: { keys: 'Ctrl+Z', label: 'Undo', group: 'Edit' },
  redo: { keys: 'Ctrl+Shift+Z', label: 'Redo (also Ctrl+Y)', group: 'Edit' },
  delete: { keys: 'Delete', label: 'Delete (also Backspace)', group: 'Edit' },
  duplicate: { keys: 'Ctrl+D', label: 'Duplicate', group: 'Edit' },
  copy: { keys: 'Ctrl+C', label: 'Copy', group: 'Edit' },
  paste: { keys: 'Ctrl+V', label: 'Paste', group: 'Edit' },
  cut: { keys: 'Ctrl+X', label: 'Cut', group: 'Edit' },

  selectAll: { keys: 'Ctrl+A', label: 'Select all', group: 'Selection' },
  escape: { keys: 'Esc', label: 'Deselect or select parent', group: 'Selection' },
  enter: { keys: 'Enter', label: 'Select children', group: 'Selection' },
  parent: { keys: 'Shift+Enter', label: 'Select parent', group: 'Selection' },
  nextSibling: { keys: 'Tab', label: 'Select next sibling', group: 'Selection' },
  prevSibling: { keys: 'Shift+Tab', label: 'Select previous sibling', group: 'Selection' },

  wrapInFrame: { keys: 'Ctrl+Alt+G', label: 'Frame selection', group: 'Arrange' },
  addAutoLayout: { keys: 'Shift+A', label: 'Add auto layout', group: 'Arrange' },
  createComponent: { keys: 'Ctrl+Alt+K', label: 'Create component', group: 'Arrange' },
  forward: { keys: 'Ctrl+]', label: 'Bring forward', group: 'Arrange' },
  backward: { keys: 'Ctrl+[', label: 'Send backward', group: 'Arrange' },
  front: { keys: 'Ctrl+Shift+]', label: 'Bring to front', group: 'Arrange' },
  back: { keys: 'Ctrl+Shift+[', label: 'Send to back', group: 'Arrange' },
  nudgeLeft: { keys: '←', label: 'Nudge left 1 px', group: 'Arrange' },
  nudgeRight: { keys: '→', label: 'Nudge right 1 px', group: 'Arrange' },
  nudgeUp: { keys: '↑', label: 'Nudge up 1 px', group: 'Arrange' },
  nudgeDown: { keys: '↓', label: 'Nudge down 1 px', group: 'Arrange' },
  nudgeLeft10: { keys: 'Shift+←', label: 'Nudge left 10 px', group: 'Arrange' },
  nudgeRight10: { keys: 'Shift+→', label: 'Nudge right 10 px', group: 'Arrange' },
  nudgeUp10: { keys: 'Shift+↑', label: 'Nudge up 10 px', group: 'Arrange' },
  nudgeDown10: { keys: 'Shift+↓', label: 'Nudge down 10 px', group: 'Arrange' },

  zoomIn: { keys: 'Ctrl+=', label: 'Zoom in (also Ctrl++)', group: 'View' },
  zoomOut: { keys: 'Ctrl+-', label: 'Zoom out', group: 'View' },
  zoom100: { keys: 'Ctrl+0', label: 'Zoom to 100%', group: 'View' },
  zoomFit: { keys: 'Shift+1', label: 'Zoom to fit', group: 'View' },
  zoomSelection: { keys: 'Shift+2', label: 'Zoom to selection', group: 'View' },
  help: { keys: '?', label: 'Show keyboard shortcuts', group: 'View' },
  tasteCheck: { keys: 'Ctrl+Alt+V', label: 'Check frame with taste-skill', group: 'View' },
  toggleChat: { keys: 'Ctrl+L', label: 'Open or close the Claude chat', group: 'View' },
}

export const SHORTCUTS: Shortcut[] = (Object.keys(TABLE) as CommandId[]).map((id) => ({ id, ...TABLE[id] }))

/** Raccourci d'une commande, tel qu'affiché dans les infobulles et les menus (« Ctrl+D »). */
export const shortcutKeys = (id: CommandId): string => TABLE[id].keys

/**
 * Une liaison : touche (sur `key`, insensible à la casse, ou sur `code`) + modificateurs exacts.
 * `shift: 'any'` = Maj ignoré (ex. `?`, `Ctrl++`).
 */
interface Binding {
  id: CommandId
  key?: string[]
  code?: string[]
  ctrl?: boolean
  shift?: boolean | 'any'
  alt?: boolean
}

const letter = (id: CommandId, l: string, mods: Omit<Binding, 'id' | 'key' | 'code'> = {}): Binding => ({ id, key: [l], ...mods })
const code = (id: CommandId, c: string[], mods: Omit<Binding, 'id' | 'key' | 'code'> = {}): Binding => ({ id, code: c, ...mods })

const BINDINGS: Binding[] = [
  letter('tool.move', 'v'),
  letter('tool.frame', 'f'),
  letter('tool.rect', 'r'),
  letter('tool.ellipse', 'o'),
  letter('tool.text', 't'),
  letter('insertIcon', 'i', { shift: true }),

  letter('undo', 'z', { ctrl: true }),
  letter('redo', 'z', { ctrl: true, shift: true }),
  letter('redo', 'y', { ctrl: true }),
  { id: 'delete', key: ['delete', 'backspace'] },
  letter('duplicate', 'd', { ctrl: true }),
  letter('copy', 'c', { ctrl: true }),
  letter('paste', 'v', { ctrl: true }),
  letter('cut', 'x', { ctrl: true }),

  letter('selectAll', 'a', { ctrl: true }),
  { id: 'escape', key: ['escape'] },
  { id: 'enter', key: ['enter'] },
  { id: 'parent', key: ['enter'], shift: true },
  { id: 'nextSibling', key: ['tab'] },
  { id: 'prevSibling', key: ['tab'], shift: true },

  letter('wrapInFrame', 'g', { ctrl: true, alt: true }),
  letter('tasteCheck', 'v', { ctrl: true, alt: true }),
  letter('createComponent', 'k', { ctrl: true, alt: true }),
  letter('toggleChat', 'l', { ctrl: true }),
  letter('addAutoLayout', 'a', { shift: true }),
  code('forward', ['BracketRight'], { ctrl: true }),
  code('backward', ['BracketLeft'], { ctrl: true }),
  code('front', ['BracketRight'], { ctrl: true, shift: true }),
  code('back', ['BracketLeft'], { ctrl: true, shift: true }),
  { id: 'nudgeLeft', key: ['arrowleft'] },
  { id: 'nudgeRight', key: ['arrowright'] },
  { id: 'nudgeUp', key: ['arrowup'] },
  { id: 'nudgeDown', key: ['arrowdown'] },
  { id: 'nudgeLeft10', key: ['arrowleft'], shift: true },
  { id: 'nudgeRight10', key: ['arrowright'], shift: true },
  { id: 'nudgeUp10', key: ['arrowup'], shift: true },
  { id: 'nudgeDown10', key: ['arrowdown'], shift: true },

  code('zoomIn', ['Equal', 'NumpadAdd'], { ctrl: true, shift: 'any' }),
  code('zoomOut', ['Minus', 'NumpadSubtract'], { ctrl: true, shift: 'any' }),
  code('zoom100', ['Digit0', 'Numpad0'], { ctrl: true }),
  code('zoomFit', ['Digit1'], { shift: true }),
  code('zoomSelection', ['Digit2'], { shift: true }),
  { id: 'help', key: ['?'], shift: 'any' },

  // AZERTY : ] et [ se tapent avec AltGr, que Windows transmet comme Ctrl+Alt ; - et + sont ailleurs.
  { id: 'forward', key: [']'], ctrl: true, alt: true },
  { id: 'backward', key: ['['], ctrl: true, alt: true },
  { id: 'zoomOut', key: ['-'], ctrl: true, shift: 'any' },
  { id: 'zoomIn', key: ['+', '='], ctrl: true, shift: 'any' },
]

function matches(b: Binding, e: KeyLike): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl !== (b.ctrl ?? false)) return false
  if (e.altKey !== (b.alt ?? false)) return false
  if (b.shift !== 'any' && e.shiftKey !== (b.shift ?? false)) return false
  if (b.key) return b.key.includes(e.key.toLowerCase())
  return b.code !== undefined && b.code.includes(e.code)
}

/** Commande déclenchée par une frappe, ou `null`. Les modificateurs doivent correspondre exactement. */
export function matchShortcut(e: KeyLike): CommandId | null {
  return BINDINGS.find((b) => matches(b, e))?.id ?? null
}
