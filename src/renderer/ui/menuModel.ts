/** Modèle des menus et navigation au clavier. Module pur : ni React ni DOM. */

export interface MenuSeparator { separator: true }

export interface MenuAction {
  separator?: false
  label: string
  /** Raccourci affiché à droite, au format Windows (« Ctrl+D », « Suppr »). */
  shortcut?: string
  onSelect?: () => void
  disabled?: boolean
  /** Action destructrice : en rouge. */
  danger?: boolean
  /** Sous-menu, ouvert au survol, avec → ou Entrée. */
  submenu?: MenuEntry[]
}

export type MenuEntry = MenuAction | MenuSeparator

export const SEPARATOR: MenuSeparator = { separator: true }

export const isSeparator = (e: MenuEntry): e is MenuSeparator => e.separator === true

/** Rangée que le clavier ou la souris peut mettre en surbrillance. */
export const isFocusable = (e: MenuEntry | undefined): e is MenuAction => !!e && !isSeparator(e) && !e.disabled

/**
 * Rangée suivante (dir = 1) ou précédente (dir = -1) depuis `from`, en sautant séparateurs et
 * rangées désactivées, en bouclant. `from` = -1 : aucune rangée active (↓ donne la première,
 * ↑ la dernière). Renvoie -1 s'il n'y a aucune rangée utilisable.
 */
export function stepIndex(items: MenuEntry[], from: number, dir: 1 | -1): number {
  const n = items.length
  if (n === 0) return -1
  let i = from < 0 ? (dir === 1 ? -1 : n) : from
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n
    if (isFocusable(items[i])) return i
  }
  return -1
}

export const firstIndex = (items: MenuEntry[]) => stepIndex(items, -1, 1)
export const lastIndex = (items: MenuEntry[]) => stepIndex(items, -1, -1)

const ARIA_KEYS: Record<string, string> = {
  Ctrl: 'Control', Shift: 'Shift', Alt: 'Alt', Delete: 'Delete', Del: 'Delete', Esc: 'Escape', Enter: 'Enter',
  '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown',
}

/** Raccourci affiché (« Ctrl+Shift+] ») → valeur de `aria-keyshortcuts` (« Control+Shift+] »). */
export const ariaKeys = (shortcut: string): string =>
  shortcut.split('+').map((k) => ARIA_KEYS[k] ?? k).join('+')

/** Retire les séparateurs en tête, en queue et en double (menus construits selon le contexte). */
export function tidy(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const item of items) {
    if (isSeparator(item) && (out.length === 0 || isSeparator(out[out.length - 1]!))) continue
    out.push(item)
  }
  while (out.length && isSeparator(out[out.length - 1]!)) out.pop()
  return out
}
