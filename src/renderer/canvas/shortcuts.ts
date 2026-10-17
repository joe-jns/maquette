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
  | 'help' | 'tasteCheck' | 'toggleChat'

export interface Shortcut {
  id: CommandId
  keys: string
  label: string
  group: 'Outils' | 'Édition' | 'Sélection' | 'Disposition' | 'Affichage'
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
  'tool.move': { keys: 'V', label: 'Déplacer', group: 'Outils' },
  'tool.frame': { keys: 'F', label: 'Cadre', group: 'Outils' },
  'tool.rect': { keys: 'R', label: 'Rectangle', group: 'Outils' },
  'tool.ellipse': { keys: 'O', label: 'Ellipse', group: 'Outils' },
  'tool.text': { keys: 'T', label: 'Texte', group: 'Outils' },

  undo: { keys: 'Ctrl+Z', label: 'Annuler', group: 'Édition' },
  redo: { keys: 'Ctrl+Maj+Z', label: 'Rétablir (aussi Ctrl+Y)', group: 'Édition' },
  delete: { keys: 'Suppr', label: 'Supprimer (aussi Retour arrière)', group: 'Édition' },
  duplicate: { keys: 'Ctrl+D', label: 'Dupliquer', group: 'Édition' },
  copy: { keys: 'Ctrl+C', label: 'Copier', group: 'Édition' },
  paste: { keys: 'Ctrl+V', label: 'Coller', group: 'Édition' },
  cut: { keys: 'Ctrl+X', label: 'Couper', group: 'Édition' },

  selectAll: { keys: 'Ctrl+A', label: 'Tout sélectionner', group: 'Sélection' },
  escape: { keys: 'Échap', label: 'Désélectionner ou remonter au parent', group: 'Sélection' },
  enter: { keys: 'Entrée', label: 'Sélectionner les enfants', group: 'Sélection' },
  parent: { keys: 'Maj+Entrée', label: 'Sélectionner le parent', group: 'Sélection' },
  nextSibling: { keys: 'Tab', label: 'Élément suivant', group: 'Sélection' },
  prevSibling: { keys: 'Maj+Tab', label: 'Élément précédent', group: 'Sélection' },

  wrapInFrame: { keys: 'Ctrl+Alt+G', label: 'Mettre dans un cadre', group: 'Disposition' },
  addAutoLayout: { keys: 'Maj+A', label: 'Passer en mise en page automatique', group: 'Disposition' },
  forward: { keys: 'Ctrl+]', label: 'Avancer d’un plan', group: 'Disposition' },
  backward: { keys: 'Ctrl+[', label: 'Reculer d’un plan', group: 'Disposition' },
  front: { keys: 'Ctrl+Maj+]', label: 'Mettre au premier plan', group: 'Disposition' },
  back: { keys: 'Ctrl+Maj+[', label: 'Mettre à l’arrière-plan', group: 'Disposition' },
  nudgeLeft: { keys: '←', label: 'Décaler à gauche de 1 px', group: 'Disposition' },
  nudgeRight: { keys: '→', label: 'Décaler à droite de 1 px', group: 'Disposition' },
  nudgeUp: { keys: '↑', label: 'Décaler vers le haut de 1 px', group: 'Disposition' },
  nudgeDown: { keys: '↓', label: 'Décaler vers le bas de 1 px', group: 'Disposition' },
  nudgeLeft10: { keys: 'Maj+←', label: 'Décaler à gauche de 10 px', group: 'Disposition' },
  nudgeRight10: { keys: 'Maj+→', label: 'Décaler à droite de 10 px', group: 'Disposition' },
  nudgeUp10: { keys: 'Maj+↑', label: 'Décaler vers le haut de 10 px', group: 'Disposition' },
  nudgeDown10: { keys: 'Maj+↓', label: 'Décaler vers le bas de 10 px', group: 'Disposition' },

  zoomIn: { keys: 'Ctrl+=', label: 'Zoom avant (aussi Ctrl++)', group: 'Affichage' },
  zoomOut: { keys: 'Ctrl+-', label: 'Zoom arrière', group: 'Affichage' },
  zoom100: { keys: 'Ctrl+0', label: 'Zoom à 100 %', group: 'Affichage' },
  zoomFit: { keys: 'Maj+1', label: 'Tout voir', group: 'Affichage' },
  zoomSelection: { keys: 'Maj+2', label: 'Zoomer sur la sélection', group: 'Affichage' },
  help: { keys: '?', label: 'Afficher les raccourcis', group: 'Affichage' },
  tasteCheck: { keys: 'Ctrl+Alt+V', label: 'Vérifier le cadre avec taste-skill', group: 'Affichage' },
  toggleChat: { keys: 'Ctrl+L', label: 'Ouvrir ou fermer le chat avec Claude', group: 'Affichage' },
}

export const SHORTCUTS: Shortcut[] = (Object.keys(TABLE) as CommandId[]).map((id) => ({ id, ...TABLE[id] }))

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
