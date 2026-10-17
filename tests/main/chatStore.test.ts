import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatStore, MAX_ITEMS, UNTITLED, chatKey } from '../../src/main/chat/chatStore'

const fresh = () => join(mkdtempSync(join(tmpdir(), 'maquette-chat-')), 'chats.json')

describe('historique des conversations', () => {
  it('une conversation par fichier, sans-titre à part', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    expect(chatKey(null)).toBe(UNTITLED)
    await store.appendOrReplace('C:\\a.maquette', { kind: 'user', id: 'u1', text: 'Salut', images: 0 })
    await store.setSession('C:\\a.maquette', 'sess-1')
    await store.appendOrReplace(UNTITLED, { kind: 'user', id: 'u2', text: 'Autre', images: 1 })
    expect(await store.get('C:\\a.maquette')).toEqual({ sessionId: 'sess-1', items: [{ kind: 'user', id: 'u1', text: 'Salut', images: 0 }] })
    expect((await store.get(UNTITLED)).items).toHaveLength(1)
    expect(await store.get('C:\\b.maquette')).toEqual({ sessionId: null, items: [] })

    // Relu depuis le disque par une autre instance (relance de l'app).
    const again = new ChatStore(file)
    expect((await again.get('C:\\a.maquette')).sessionId).toBe('sess-1')
  })

  it('remplace l’élément de même id', async () => {
    const store = new ChatStore(fresh())
    await store.appendOrReplace('k', { kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'running' })
    await store.appendOrReplace('k', { kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'done' })
    expect((await store.get('k')).items).toEqual([{ kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'done' }])
  })

  it('écritures en série : aucun ajout perdu, 200 éléments au plus (les plus récents)', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    await Promise.all(Array.from({ length: MAX_ITEMS + 30 }, (_, i) => store.appendOrReplace('k', { kind: 'assistant', id: `a${i}`, text: String(i) })))
    const { items } = await store.get('k')
    expect(items).toHaveLength(MAX_ITEMS)
    expect(items[0]!.id).toBe('a30')
    expect(items.at(-1)!.id).toBe(`a${MAX_ITEMS + 29}`)
    expect(JSON.parse(readFileSync(file, 'utf8')).k.items).toHaveLength(MAX_ITEMS)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('reset oublie la conversation et sa session', async () => {
    const store = new ChatStore(fresh())
    await store.setSession(UNTITLED, 's')
    await store.appendOrReplace(UNTITLED, { kind: 'error', id: 'e', text: 'x' })
    await store.reset(UNTITLED)
    expect(await store.get(UNTITLED)).toEqual({ sessionId: null, items: [] })
  })

  it('fichier abîmé : historique vide, puis réécrit proprement', async () => {
    const file = fresh()
    writeFileSync(file, '{ pas du json')
    const store = new ChatStore(file)
    expect(await store.get('k')).toEqual({ sessionId: null, items: [] })
    await store.setSession('k', 's')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ k: { sessionId: 's', items: [] } })
  })

  it('réglages par conversation : taste éteint par défaut, gardés par « nouvelle conversation », pas au démarrage', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    expect(await store.options('a')).toEqual({ taste: false })
    expect(await store.setOptions('a', { taste: true })).toEqual({ taste: true })
    expect(await store.options('b')).toEqual({ taste: false })
    await store.appendOrReplace('a', { kind: 'user', id: 'u1', text: 'Salut', images: 0 })
    expect(await new ChatStore(file).options('a')).toEqual({ taste: true })
    await store.reset('a', true)
    expect(await store.get('a')).toEqual({ sessionId: null, items: [] })
    expect(await store.options('a')).toEqual({ taste: true })
    await store.reset('a')
    expect(await store.options('a')).toEqual({ taste: false })
    // Valeur abîmée dans le fichier : valeur par défaut.
    writeFileSync(file, JSON.stringify({ c: { sessionId: null, items: [], options: { taste: 'oui' } } }))
    expect(await new ChatStore(file).options('c')).toEqual({ taste: false })
  })
})
