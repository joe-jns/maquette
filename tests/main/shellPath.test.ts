import { describe, expect, it } from 'vitest'
import { mergePath, readShellPath } from '../../src/main/shellPath'

describe('PATH sous macOS', () => {
  it('ajoute le PATH du shell puis les dossiers habituels, sans doublon', () => {
    const merged = mergePath('/usr/bin:/bin', '/Users/jo/.local/bin:/usr/bin:/opt/homebrew/bin', '/Users/jo')
    expect(merged.split(':')).toEqual([
      '/usr/bin',
      '/bin',
      '/Users/jo/.local/bin',
      '/opt/homebrew/bin',
      '/Users/jo/.claude/local',
      '/usr/local/bin',
    ])
  })

  it('sans shell lisible, garde le PATH reçu et ajoute les dossiers habituels', () => {
    const merged = mergePath(undefined, null, '/Users/jo').split(':')
    expect(merged).toContain('/opt/homebrew/bin')
    expect(merged).not.toContain('')
  })

  it('shell introuvable : null, pas d’erreur', () => {
    expect(readShellPath('/nexiste/pas/zsh')).toBeNull()
  })
})
