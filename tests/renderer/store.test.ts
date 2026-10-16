import { describe, it, expect, beforeEach } from 'vitest'
import { docStore } from '../../src/renderer/state/store'
import { docWith, rect } from '../core/helpers'

beforeEach(() => {
  docStore.getState().load(docWith([rect('r00001', { x: 0, y: 0, name: 'A' })]), 'C:/x/demo.maquette')
})

describe('docStore', () => {
  it('charger remet l’état à zéro', () => {
    const s = docStore.getState()
    expect(s).toMatchObject({ dirty: false, canUndo: false, canRedo: false, filePath: 'C:/x/demo.maquette', notice: null })
    expect(s.pageId).toBe(s.doc.pages[0]!.id)
  })

  it('une modification réussie marque le document modifié et annulable', () => {
    const r = docStore.getState().dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    expect(r.ok).toBe(true)
    expect(docStore.getState()).toMatchObject({ dirty: true, canUndo: true })
  })

  it('un lot refusé ne change rien et ne pollue pas l’historique', () => {
    const before = docStore.getState().doc
    const r = docStore.getState().dispatch([{ op: 'update', id: 'absent', set: { name: 'B' } }], 'Raté')
    expect(r.ok).toBe(false)
    expect(docStore.getState().doc).toBe(before)
    expect(docStore.getState()).toMatchObject({ dirty: false, canUndo: false })
  })

  it('annuler après un lot refusé porte sur la dernière modification réussie', () => {
    const s = docStore.getState()
    s.dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    s.dispatch([{ op: 'update', id: 'absent', set: { name: 'C' } }], 'Raté')
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState().canRedo).toBe(true)
    docStore.getState().redo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('B')
  })

  it('enregistrer efface l’indicateur de modification', () => {
    docStore.getState().dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Renommer')
    docStore.getState().markSaved('C:/x/autre.maquette')
    expect(docStore.getState()).toMatchObject({ dirty: false, filePath: 'C:/x/autre.maquette' })
  })
})

describe('gestes', () => {
  it('un geste = une seule entrée d’historique', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'C' } }])
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('C')
    expect(docStore.getState().canUndo).toBe(false)
    docStore.getState().commitGesture('Renommer')
    expect(docStore.getState()).toMatchObject({ canUndo: true, dirty: true, inGesture: false })
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState().canUndo).toBe(false)
  })

  it('les aperçus ne se cumulent pas : chacun part de la base', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { opacity: 0.5 } }])
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    expect(docStore.getState().doc.pages[0]!.children[0]).toMatchObject({ name: 'B', opacity: 1 })
  })

  it('annuler le geste revient à la base sans historique', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    docStore.getState().cancelGesture()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
    expect(docStore.getState()).toMatchObject({ canUndo: false, inGesture: false })
  })

  it('un aperçu refusé garde le dernier aperçu valide', () => {
    const s = docStore.getState()
    s.beginGesture()
    s.previewGesture([{ op: 'update', id: 'r00001', set: { name: 'B' } }])
    const r = s.previewGesture([{ op: 'update', id: 'absent', set: { name: 'X' } }])
    expect(r.ok).toBe(false)
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('B')
    docStore.getState().commitGesture('Renommer')
    docStore.getState().undo()
    expect(docStore.getState().doc.pages[0]!.children[0]!.name).toBe('A')
  })

  it('valider sans aperçu ne crée pas d’entrée', () => {
    docStore.getState().beginGesture()
    docStore.getState().commitGesture('Rien')
    expect(docStore.getState().canUndo).toBe(false)
  })
})
