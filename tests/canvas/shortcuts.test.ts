import { describe, it, expect } from 'vitest'
import { SHORTCUTS, matchShortcut, type KeyLike } from '../../src/renderer/canvas/shortcuts'

const k = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})

describe('raccourcis', () => {
  it('outils sans modificateur ; une lettre avec Ctrl ne choisit pas d’outil', () => {
    expect(matchShortcut(k('r', 'KeyR'))).toBe('tool.rect')
    expect(matchShortcut(k('t', 'KeyT'))).toBe('tool.text')
    expect(matchShortcut(k('f', 'KeyF'))).toBe('tool.frame')
    expect(matchShortcut(k('o', 'KeyO'))).toBe('tool.ellipse')
    expect(matchShortcut(k('v', 'KeyV'))).toBe('tool.move')
    expect(matchShortcut(k('r', 'KeyR', { ctrlKey: true }))).toBeNull()
  })

  it('AZERTY : les lettres suivent la lettre tapée, les chiffres la touche physique', () => {
    expect(matchShortcut(k('A', 'KeyQ', { shiftKey: true }))).toBe('addAutoLayout')
    expect(matchShortcut(k('d', 'KeyD', { ctrlKey: true }))).toBe('duplicate')
    expect(matchShortcut(k('à', 'Digit0', { ctrlKey: true }))).toBe('zoom100')
    expect(matchShortcut(k('1', 'Digit1', { shiftKey: true }))).toBe('zoomFit')
    expect(matchShortcut(k('2', 'Digit2', { shiftKey: true }))).toBe('zoomSelection')
  })

  it('Ctrl+L ouvre ou ferme le chat ; L seul ne fait rien', () => {
    expect(matchShortcut(k('l', 'KeyL', { ctrlKey: true }))).toBe('toggleChat')
    expect(matchShortcut(k('l', 'KeyL'))).toBeNull()
    expect(SHORTCUTS.find((s) => s.id === 'toggleChat')).toMatchObject({ keys: 'Ctrl+L', group: 'Affichage' })
  })

  it('édition', () => {
    expect(matchShortcut(k('z', 'KeyZ', { ctrlKey: true }))).toBe('undo')
    expect(matchShortcut(k('y', 'KeyY', { ctrlKey: true }))).toBe('redo')
    expect(matchShortcut(k('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(matchShortcut(k('Delete', 'Delete'))).toBe('delete')
    expect(matchShortcut(k('Backspace', 'Backspace'))).toBe('delete')
    expect(matchShortcut(k('g', 'KeyG', { ctrlKey: true, altKey: true }))).toBe('wrapInFrame')
    expect(matchShortcut(k('c', 'KeyC', { ctrlKey: true }))).toBe('copy')
    expect(matchShortcut(k('v', 'KeyV', { ctrlKey: true }))).toBe('paste')
    expect(matchShortcut(k('a', 'KeyA', { ctrlKey: true }))).toBe('selectAll')
  })

  it('ordre, sélection, flèches, aide', () => {
    expect(matchShortcut(k(']', 'BracketRight', { ctrlKey: true }))).toBe('forward')
    expect(matchShortcut(k('[', 'BracketLeft', { ctrlKey: true }))).toBe('backward')
    expect(matchShortcut(k('Enter', 'Enter'))).toBe('enter')
    expect(matchShortcut(k('Enter', 'Enter', { shiftKey: true }))).toBe('parent')
    expect(matchShortcut(k('Tab', 'Tab'))).toBe('nextSibling')
    expect(matchShortcut(k('Tab', 'Tab', { shiftKey: true }))).toBe('prevSibling')
    expect(matchShortcut(k('ArrowLeft', 'ArrowLeft'))).toBe('nudgeLeft')
    expect(matchShortcut(k('ArrowDown', 'ArrowDown', { shiftKey: true }))).toBe('nudgeDown10')
    expect(matchShortcut(k('Escape', 'Escape'))).toBe('escape')
    expect(matchShortcut(k('?', 'Comma', { shiftKey: true }))).toBe('help')
    expect(matchShortcut(k('=', 'Equal', { ctrlKey: true }))).toBe('zoomIn')
    expect(matchShortcut(k('-', 'Minus', { ctrlKey: true }))).toBe('zoomOut')
  })

  it('chaque commande a une entrée lisible dans la table', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id))
    expect(ids.size).toBe(SHORTCUTS.length)
    expect(SHORTCUTS.find((s) => s.id === 'duplicate')).toMatchObject({ keys: 'Ctrl+D', group: 'Édition' })
  })

  it('AZERTY : ] et [ arrivent par AltGr (= Ctrl+Alt), - est sur la touche 6', () => {
    expect(matchShortcut(k(']', 'Minus', { ctrlKey: true, altKey: true }))).toBe('forward')
    expect(matchShortcut(k('[', 'Digit5', { ctrlKey: true, altKey: true }))).toBe('backward')
    expect(matchShortcut(k('-', 'Digit6', { ctrlKey: true }))).toBe('zoomOut')
    expect(matchShortcut(k('+', 'Equal', { ctrlKey: true, shiftKey: true }))).toBe('zoomIn')
  })
})
