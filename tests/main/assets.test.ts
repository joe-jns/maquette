import { describe, it, expect } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveAssetPath } from '../../src/main/assetPath'

const base = resolve('C:/projets/client é')

describe('resolveAssetPath', () => {
  it('résout un chemin relatif au dossier du document', () => {
    expect(resolveAssetPath(base, '/assets/photo%20%C3%A9t%C3%A9.png')).toBe(join(base, 'assets', 'photo été.png'))
  })

  it('refuse de sortir du dossier du document', () => {
    expect(resolveAssetPath(base, '/../secret.txt')).toBeNull()
    expect(resolveAssetPath(base, '/assets/../../secret.txt')).toBeNull()
  })

  it('refuse un chemin vide', () => {
    expect(resolveAssetPath(base, '/')).toBeNull()
  })
})
