import { describe, it, expect } from 'vitest'
import { beforeClaudeName, replyGroup, replyLabel, requestStart } from '../../src/renderer/chat/replies'

describe('réponses de Claude', () => {
  it('début de la demande : une ligne, coupé avec « … » au-delà de la limite', () => {
    expect(requestStart('  Ajoute\nun   hero ')).toBe('Ajoute un hero')
    const long = 'x'.repeat(80)
    expect(requestStart(long)).toHaveLength(60)
    expect(requestStart(long).endsWith('…')).toBe(true)
  })

  it('groupe, libellé et nom de version', () => {
    expect(replyGroup('u-1')).toBe('claude:u-1')
    expect(replyLabel('Dessine un bouton')).toBe('Claude: Dessine un bouton')
    expect(beforeClaudeName('Dessine un bouton')).toBe('Before Claude: Dessine un bouton')
    expect(beforeClaudeName('y'.repeat(100)).length).toBeLessThanOrEqual(60)
  })
})
