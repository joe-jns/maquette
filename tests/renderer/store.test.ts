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
