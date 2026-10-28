import { describe, expect, it } from 'vitest'
import { SEPARATOR, ariaKeys, firstIndex, lastIndex, stepIndex, tidy, type MenuEntry } from '../../src/renderer/ui/menuModel'

const items: MenuEntry[] = [
  { label: 'Copier' },
  { label: 'Coller', disabled: true },
  SEPARATOR,
  { label: 'Dupliquer' },
  SEPARATOR,
  { label: 'Supprimer', danger: true },
]

describe('stepIndex', () => {
  it('↓ et ↑ sautent séparateurs et rangées désactivées', () => {
    expect(stepIndex(items, 0, 1)).toBe(3)
    expect(stepIndex(items, 3, 1)).toBe(5)
    expect(stepIndex(items, 3, -1)).toBe(0)
  })

  it('boucle aux extrémités', () => {
    expect(stepIndex(items, 5, 1)).toBe(0)
    expect(stepIndex(items, 0, -1)).toBe(5)
  })

  it('sans rangée active : ↓ donne la première, ↑ la dernière', () => {
    expect(stepIndex(items, -1, 1)).toBe(0)
    expect(stepIndex(items, -1, -1)).toBe(5)
    expect(firstIndex(items)).toBe(0)
    expect(lastIndex(items)).toBe(5)
  })

  it('-1 si rien n’est utilisable', () => {
    expect(stepIndex([], -1, 1)).toBe(-1)
    expect(stepIndex([SEPARATOR, { label: 'x', disabled: true }], -1, 1)).toBe(-1)
  })
})

describe('tidy', () => {
  it('retire les séparateurs en tête, en queue et en double', () => {
    const out = tidy([SEPARATOR, { label: 'a' }, SEPARATOR, SEPARATOR, { label: 'b' }, SEPARATOR])
    expect(out).toEqual([{ label: 'a' }, SEPARATOR, { label: 'b' }])
  })
})

describe('ariaKeys', () => {
  it('traduit le format affiché en noms de touches standard', () => {
    expect(ariaKeys('Ctrl+D')).toBe('Control+D')
    expect(ariaKeys('Ctrl+Shift+]')).toBe('Control+Shift+]')
    expect(ariaKeys('Delete')).toBe('Delete')
    expect(ariaKeys('Esc')).toBe('Escape')
    expect(ariaKeys('Shift+Enter')).toBe('Shift+Enter')
    expect(ariaKeys('Ctrl+Alt+G')).toBe('Control+Alt+G')
  })
})
