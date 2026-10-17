import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ChatItem } from '../../src/shared/chat'

/** Stockage en mémoire à la place de localStorage (absent sous Node). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

async function freshStore(storage: unknown) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  return (await import('../../src/renderer/chat/chatStore')).chatStore
}

const user: ChatItem = { kind: 'user', id: 'u1', text: 'Bonjour', images: 0 }

describe('chatStore', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('reprend l’état ouvert mémorisé et le retient', async () => {
    const storage = memoryStorage({ 'maquette.chat.open': '1' })
    const store = await freshStore(storage)
    expect(store.getState().open).toBe(true)
    store.getState().toggle()
    expect(store.getState().open).toBe(false)
    expect(storage.data.get('maquette.chat.open')).toBe('0')
  })

  it('stockage inaccessible : fermé, sans erreur', async () => {
    const broken = { getItem: () => { throw new Error('refusé') }, setItem: () => { throw new Error('refusé') } }
    const store = await freshStore(broken)
    expect(store.getState().open).toBe(false)
    expect(() => store.getState().setOpen(true)).not.toThrow()
    expect(store.getState().open).toBe(true)
  })

  it('ouvrir demande le focus dans la saisie', async () => {
    const store = await freshStore(memoryStorage())
    const before = store.getState().focusRequest
    store.getState().setOpen(true)
    expect(store.getState().focusRequest).toBe(before + 1)
    store.getState().setOpen(false)
    expect(store.getState().focusRequest).toBe(before + 1)
  })

  it('élément : ajouté, puis remplacé sur place par le même id', async () => {
    const store = await freshStore(memoryStorage())
    const s = store.getState()
    s.applyEvent({ type: 'item', item: user })
    s.applyEvent({ type: 'item', item: { kind: 'tool', id: 't1', name: 'appliquer', summary: '3 éléments', status: 'running' } })
    s.applyEvent({ type: 'item', item: { kind: 'tool', id: 't1', name: 'appliquer', summary: '3 éléments', status: 'done' } })
    expect(store.getState().items.map((i) => i.id)).toEqual(['u1', 't1'])
    expect(store.getState().items[1]).toMatchObject({ status: 'done' })
  })

  it('delta : crée le message de Claude puis y ajoute le texte', async () => {
    const store = await freshStore(memoryStorage())
    const s = store.getState()
    s.applyEvent({ type: 'delta', id: 'a1', text: 'Bon' })
    s.applyEvent({ type: 'delta', id: 'a1', text: 'jour' })
    expect(store.getState().items).toEqual([{ kind: 'assistant', id: 'a1', text: 'Bonjour' }])
  })

  it('delta sur un élément qui n’est pas de Claude : ignoré', async () => {
    const store = await freshStore(memoryStorage())
    store.getState().setItems([user])
    store.getState().applyEvent({ type: 'delta', id: 'u1', text: '!' })
    expect(store.getState().items).toEqual([user])
  })

  it('busy suit les événements ; un nouvel historique remet à l’arrêt', async () => {
    const store = await freshStore(memoryStorage())
    store.getState().applyEvent({ type: 'busy', busy: true })
    expect(store.getState().busy).toBe(true)
    store.getState().setItems([user])
    expect(store.getState()).toMatchObject({ busy: false, items: [user] })
  })

  it('vignettes d’un outil : arrivent en remplaçant l’élément ; ancien historique sans détail accepté', async () => {
    const store = await freshStore(memoryStorage())
    const s = store.getState()
    const old: ChatItem = { kind: 'tool', id: 't0', name: 'Read', summary: 'a.ts', status: 'done' }
    s.setItems([user, old])
    const done: ChatItem = { kind: 'tool', id: 't1', name: 'capture', summary: '', input: '{}', output: 'capture', status: 'done' }
    s.applyEvent({ type: 'item', item: done })
    const ref = { hash: 'a'.repeat(64), width: 640, height: 400 }
    s.applyEvent({ type: 'item', item: { ...done, images: [ref] } })
    expect(store.getState().items).toEqual([user, old, { ...done, images: [ref] }])
  })

  it('aperçu en grand : ouvert, fermé, oublié en fermant le panneau ou en changeant d’historique', async () => {
    const store = await freshStore(memoryStorage())
    const ref = { hash: 'b'.repeat(64), width: 10, height: 10 }
    store.getState().setPreview(ref)
    expect(store.getState().preview).toEqual(ref)
    store.getState().setPreview(null)
    expect(store.getState().preview).toBeNull()
    store.getState().setPreview(ref)
    store.getState().setOpen(false)
    expect(store.getState().preview).toBeNull()
    store.getState().setPreview(ref)
    store.getState().setItems([])
    expect(store.getState().preview).toBeNull()
  })

  it('images : 5 au plus, retirées une à une, vidées avec le brouillon', async () => {
    const store = await freshStore(memoryStorage())
    const s = store.getState()
    for (let i = 0; i < 5; i++) expect(s.addImage({ mediaType: 'image/png', data: 'AAAA' })).toBe(true)
    expect(s.addImage({ mediaType: 'image/png', data: 'AAAA' })).toBe(false)
    const [first] = store.getState().images
    expect(first!.url).toBe('data:image/png;base64,AAAA')
    s.removeImage(first!.id)
    expect(store.getState().images).toHaveLength(4)
    s.setDraft('Salut')
    s.clearComposer()
    expect(store.getState()).toMatchObject({ draft: '', images: [] })
  })
})
