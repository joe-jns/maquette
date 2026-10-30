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

describe('docStore : groupes et document remplacé', () => {
  const name = () => docStore.getState().doc.pages[0]!.children[0]!.name

  it('les modifications d’un groupe s’annulent d’un coup ; groupDepth et topGroup suivent', () => {
    const s = docStore.getState()
    s.dispatch([{ op: 'update', id: 'r00001', set: { name: 'B' } }], 'Claude', 'claude:1')
    s.dispatch([{ op: 'update', id: 'r00001', set: { name: 'C' } }], 'Claude', 'claude:1')
    expect(s.groupDepth('claude:1')).toBe(0)
    expect(s.topGroup()).toBe('claude:1')
    s.dispatch([{ op: 'update', id: 'r00001', set: { name: 'D' } }], 'Renommer')
    expect(s.groupDepth('claude:1')).toBe(1)
    expect(s.topGroup()).toBeUndefined()
    docStore.getState().undo()
    docStore.getState().undo()
    expect(name()).toBe('A')
    expect(s.groupDepth('claude:1')).toBeNull()
  })

  it('remplacer le document : une étape annulable, page affichée gardée si elle existe', () => {
    const s = docStore.getState()
    const before = s.doc
    const other = docWith([rect('r00002', { x: 5, y: 5, name: 'Z' })])
    s.replaceDocument(other, 'Restaurer')
    expect(name()).toBe('Z')
    expect(docStore.getState()).toMatchObject({ dirty: true, canUndo: true })
    expect(docStore.getState().pageId).toBe(docStore.getState().doc.pages[0]!.id)
    docStore.getState().undo()
    expect(docStore.getState().doc).toEqual(before)
    docStore.getState().redo()
    expect(name()).toBe('Z')
    // Après un remplacement, les modifications ordinaires continuent de marcher.
    expect(docStore.getState().dispatch([{ op: 'update', id: 'r00002', set: { name: 'Y' } }], 'Renommer').ok).toBe(true)
    docStore.getState().undo()
    expect(name()).toBe('Z')
  })
})
