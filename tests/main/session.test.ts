import { describe, it, expect, beforeEach } from 'vitest'
import { join, resolve } from 'node:path'
import { acceptPath, allowedSavePath, getCurrentDir, offerPath, resetSession, savedTo } from '../../src/main/state'

const a = resolve('C:/projets/client é/accueil.maquette')
const b = resolve('C:/ailleurs/cassé.maquette')

beforeEach(() => resetSession())

describe('session du document (processus principal)', () => {
  it('un fichier proposé ne devient le document courant qu’une fois accepté par la fenêtre', () => {
    offerPath(a)
    expect(getCurrentDir()).toBeNull()
    expect(acceptPath(a)).toBe(true)
    expect(getCurrentDir()).toBe(resolve('C:/projets/client é'))
  })

  it('un fichier refusé par la fenêtre ne change pas le dossier des images', () => {
    offerPath(a)
    acceptPath(a)
    offerPath(b)
    expect(getCurrentDir()).toBe(resolve('C:/projets/client é'))
  })

  it('la fenêtre ne peut pas imposer un chemin qui ne lui a pas été proposé', () => {
    expect(acceptPath(join('C:/Windows', 'system.maquette'))).toBe(false)
    expect(getCurrentDir()).toBeNull()
  })

  it('« Nouveau » remet le document courant à zéro', () => {
    offerPath(a)
    acceptPath(a)
    expect(acceptPath(null)).toBe(true)
    expect(getCurrentDir()).toBeNull()
  })

  it('enregistrer n’est permis que dans le fichier courant, sinon il faut la boîte de dialogue', () => {
    offerPath(a)
    acceptPath(a)
    expect(allowedSavePath(a)).toBe(a)
    expect(allowedSavePath(a.toUpperCase())).toBe(process.platform === 'win32' ? a : null)
    expect(allowedSavePath(b)).toBeNull()
    expect(allowedSavePath(null)).toBeNull()
  })

  it('après un enregistrement, le fichier écrit devient le document courant', () => {
    savedTo(b)
    expect(getCurrentDir()).toBe(resolve('C:/ailleurs'))
    expect(allowedSavePath(b)).toBe(b)
  })
})
