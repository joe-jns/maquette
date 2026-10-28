import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatStore, MAX_CONVERSATIONS, MAX_ITEMS, UNTITLED, chatKey } from '../../src/main/chat/chatStore'
import { autoTitle, NEW_CONVERSATION_TITLE, type ChatItem } from '../../src/shared/chat'

const fresh = () => join(mkdtempSync(join(tmpdir(), 'maquette-chat-')), 'chats.json')
/** Horloge réglable : chaque appel avance d'une milliseconde. */
const clock = (start = 1_000_000) => {
  let t = start
  return { now: () => t++, set: (v: number) => void (t = v) }
}
const user = (id: string, text: string, extra: Partial<Extract<ChatItem, { kind: 'user' }>> = {}): ChatItem => ({ kind: 'user', id, text, images: 0, ...extra })
const H = (c: string) => c.repeat(64)
const A = 'C:\\a.maquette'
const B = 'C:\\b.maquette'

describe('historique des conversations', () => {
  it('une conversation ouverte par fichier, sans-titre à part, relue depuis le disque', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    expect(chatKey(null)).toBe(UNTITLED)
    const a = await store.open(A)
    await store.appendOrReplace(A, a.id, user('u1', 'Salut'))
    await store.setSession(A, a.id, 'sess-1')
    const u = await store.open(UNTITLED)
    await store.appendOrReplace(UNTITLED, u.id, user('u2', 'Autre', { images: 1 }))
    expect(await store.open(A)).toMatchObject({ id: a.id, sessionId: 'sess-1', items: [user('u1', 'Salut')] })
    expect((await store.open(UNTITLED)).items).toHaveLength(1)
    const b = await store.open(B)
    expect(b).toMatchObject({ sessionId: null, items: [], title: null })

    // Relu depuis le disque par une autre instance (relance de l'app) ; la conversation vide de B n'est pas écrite.
    const again = new ChatStore(file)
    expect(await again.open(A)).toMatchObject({ id: a.id, sessionId: 'sess-1' })
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).sort()).toEqual([A, UNTITLED].sort())
  })

  it('remplace l’élément de même id', async () => {
    const store = new ChatStore(fresh())
    const { id } = await store.open('k')
    await store.appendOrReplace('k', id, { kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'running' })
    await store.appendOrReplace('k', id, { kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'done' })
    expect((await store.get('k', id))!.items).toEqual([{ kind: 'tool', id: 't1', name: 'Bash', summary: 'Bash', status: 'done' }])
  })

  it('écritures en série : aucun ajout perdu, 200 éléments au plus par conversation (les plus récents)', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    const { id } = await store.open('k')
    await Promise.all(Array.from({ length: MAX_ITEMS + 30 }, (_, i) => store.appendOrReplace('k', id, { kind: 'assistant', id: `a${i}`, text: String(i) })))
    const { items } = (await store.get('k', id))!
    expect(items).toHaveLength(MAX_ITEMS)
    expect(items[0]!.id).toBe('a30')
    expect(items.at(-1)!.id).toBe(`a${MAX_ITEMS + 29}`)
    expect(JSON.parse(readFileSync(file, 'utf8')).k.conversations[0].items).toHaveLength(MAX_ITEMS)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  }, 20_000) // 230 écritures de fichier à la suite : lent quand toute la suite tourne

  it('forget oublie toutes les conversations du fichier', async () => {
    const store = new ChatStore(fresh())
    const { id } = await store.open(UNTITLED)
    await store.setSession(UNTITLED, id, 's')
    await store.appendOrReplace(UNTITLED, id, { kind: 'error', id: 'e', text: 'x' })
    await store.forget(UNTITLED)
    const again = await store.open(UNTITLED)
    expect(again.id).not.toBe(id)
    expect(again).toMatchObject({ sessionId: null, items: [] })
  })

  it('fichier abîmé : historique vide, puis réécrit proprement', async () => {
    const file = fresh()
    writeFileSync(file, '{ pas du json')
    const store = new ChatStore(file)
    const c = await store.open('k')
    expect(c).toMatchObject({ sessionId: null, items: [] })
    await store.setSession('k', c.id, 's')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ k: { current: c.id, conversations: [{ ...c, sessionId: 's' }] } })
  })

  it('migration : l’ancien format devient la première conversation du fichier, sans perte', async () => {
    const file = fresh()
    const stamp = 1_700_000_000_000
    const items = [user(`u-${stamp.toString(36)}-1`, 'Ajoute une section tarifs', { thumbs: [{ hash: H('a'), width: 1, height: 1 }], images: 1 }), { kind: 'assistant', id: 'a1', text: 'Voilà' }]
    writeFileSync(file, JSON.stringify({
      [A]: { sessionId: 'sess-a', items, options: { taste: true } },
      [B]: { sessionId: null, items: [] },
      [UNTITLED]: { sessionId: 's', items: [user('u2', 'x')] },
    }))
    const store = new ChatStore(file, clock().now)
    const a = await store.open(A)
    expect(a).toMatchObject({ sessionId: 'sess-a', items, title: null, options: { taste: true }, createdAt: stamp, updatedAt: stamp })
    expect(await store.options(A, a.id)).toEqual({ taste: true })
    expect((await store.list(A)).conversations).toEqual([{ id: a.id, title: 'Ajoute une section tarifs', createdAt: stamp, updatedAt: stamp }])
    expect([...(await store.images())]).toEqual([H('a')])
    // B n'avait rien : rien à migrer.
    expect((await store.list(B)).conversations).toEqual([])
    // Réécrit au nouveau format au premier changement.
    await store.rename(A, a.id, 'Tarifs')
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved[A]).toEqual({ current: a.id, conversations: [{ ...a, title: 'Tarifs' }] })
    expect(saved[B]).toBeUndefined()
    // Relu : rien ne bouge.
    expect(await new ChatStore(file).open(A)).toEqual({ ...a, title: 'Tarifs' })
  })

  it('nouvelle conversation : l’ancienne reste, ordre du plus récent au plus ancien, réglages hérités', async () => {
    const c = clock()
    const store = new ChatStore(fresh(), c.now)
    const first = await store.open(A)
    await store.setOptions(A, first.id, { taste: true })
    await store.appendOrReplace(A, first.id, user('u1', 'Premier sujet'))
    await store.setSession(A, first.id, 's1')
    const { conversation: second } = await store.create(A)
    expect(second).toMatchObject({ sessionId: null, items: [], title: null, options: { taste: true } })
    // La nouvelle vide est listée (ouverte) sous le titre par défaut.
    expect((await store.list(A)).conversations.map((x) => x.title)).toEqual([NEW_CONVERSATION_TITLE, 'Premier sujet'])
    // Déjà vide : « nouvelle conversation » la réutilise.
    expect((await store.create(A)).conversation.id).toBe(second.id)
    await store.appendOrReplace(A, second.id, user('u2', 'Deuxième sujet'))
    // Activité dans la première : elle remonte en tête.
    c.set(5_000_000)
    await store.appendOrReplace(A, first.id, { kind: 'assistant', id: 'a1', text: 'ok' })
    const list = await store.list(A)
    expect(list.current).toBe(second.id)
    expect(list.conversations.map((x) => x.title)).toEqual(['Premier sujet', 'Deuxième sujet'])
    expect(list.conversations[0]!.updatedAt).toBe(5_000_000)
    // Chaque conversation garde sa session.
    expect((await store.get(A, first.id))!.sessionId).toBe('s1')
    expect((await store.get(A, second.id))!.sessionId).toBeNull()
  })

  it('select : la conversation choisie s’ouvre avec le fichier ; une vide quittée disparaît', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    const first = await store.open(A)
    await store.appendOrReplace(A, first.id, user('u1', 'Un'))
    const { conversation: empty } = await store.create(A)
    expect(await store.select(A, first.id)).toMatchObject({ id: first.id, items: [user('u1', 'Un')] })
    expect((await store.open(A)).id).toBe(first.id)
    expect(await store.get(A, empty.id)).toBeNull()
    expect(await store.select(A, 'inconnue')).toBeNull()
    expect((await new ChatStore(file).open(A)).id).toBe(first.id)
  })

  it('renommer : titre choisi, puis vide = retour au début du premier message', async () => {
    const store = new ChatStore(fresh())
    const { id } = await store.open(A)
    const long = 'Refais toute la page d’accueil avec une grande photo, trois arguments et un appel clair à la fin'
    await store.appendOrReplace(A, id, user('u1', long))
    const title = (await store.list(A)).conversations[0]!.title
    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
    expect(long.startsWith(title.slice(0, -1))).toBe(true)
    await store.rename(A, id, '  Accueil   v2 ')
    expect((await store.list(A)).conversations[0]!.title).toBe('Accueil v2')
    await store.rename(A, id, '   ')
    expect((await store.list(A)).conversations[0]!.title).toBe(title)
  })

  it('supprimer : vignettes rendues, conversation ouverte remplacée par la plus récente, écritures tardives ignorées', async () => {
    const store = new ChatStore(fresh(), clock().now)
    const first = await store.open(A)
    await store.appendOrReplace(A, first.id, user('u1', 'Un', { images: 1, thumbs: [{ hash: H('a'), width: 1, height: 1 }] }))
    const { conversation: second } = await store.create(A)
    await store.appendOrReplace(A, second.id, user('u2', 'Deux'))
    expect(await store.remove(A, second.id)).toEqual([])
    expect((await store.open(A)).id).toBe(first.id)
    expect(await store.remove(A, first.id)).toEqual([H('a')])
    // Plus rien : une nouvelle conversation vide.
    const after = await store.open(A)
    expect([first.id, second.id]).not.toContain(after.id)
    // Une écriture qui arrive après la suppression ne la fait pas revivre.
    await store.appendOrReplace(A, first.id, { kind: 'assistant', id: 'x', text: 'tard' })
    expect(await store.get(A, first.id)).toBeNull()
  })

  it(`limite : ${MAX_CONVERSATIONS} conversations par fichier, les plus anciennes partent avec leurs vignettes`, async () => {
    const store = new ChatStore(fresh(), clock().now)
    const ids: string[] = []
    let conv = await store.open(A)
    for (let i = 0; i < MAX_CONVERSATIONS; i++) {
      ids.push(conv.id)
      await store.appendOrReplace(A, conv.id, user(`u${i}`, `Sujet ${i}`, i === 0 ? { images: 1, thumbs: [{ hash: H('a'), width: 1, height: 1 }] } : {}))
      if (i < MAX_CONVERSATIONS - 1) conv = (await store.create(A)).conversation
    }
    expect((await store.list(A)).conversations).toHaveLength(MAX_CONVERSATIONS)
    const { conversation, removed } = await store.create(A)
    expect(removed).toEqual([H('a')])
    const list = (await store.list(A)).conversations
    expect(list).toHaveLength(MAX_CONVERSATIONS)
    expect(list[0]!.id).toBe(conversation.id)
    expect(list.map((x) => x.id)).not.toContain(ids[0])
    expect(list.at(-1)!.title).toBe('Sujet 1')
  }, 20_000)

  it('autres fichiers : conversations récentes, sans le fichier ouvert ni les documents sans titre', async () => {
    const c = clock()
    const store = new ChatStore(fresh(), c.now)
    const say = async (key: string, text: string, fresh = false) => {
      const conv = fresh ? (await store.create(key)).conversation : await store.open(key)
      await store.appendOrReplace(key, conv.id, user(`u-${text}`, text))
      return conv.id
    }
    await say(A, 'A un')
    await say(B, 'B un')
    const b2 = await say(B, 'B deux', true)
    await say(UNTITLED, 'sans titre')
    await store.open('C:\\vide.maquette')
    expect((await store.others(A)).map((o) => [o.path, o.title])).toEqual([[B, 'B deux'], [B, 'B un']])
    expect((await store.others(A))[0]!.id).toBe(b2)
    expect((await store.others(B)).map((o) => o.title)).toEqual(['A un'])
    for (let i = 0; i < 12; i++) await say(`C:\\f${i}.maquette`, `F${i}`)
    const others = await store.others(A)
    expect(others).toHaveLength(10)
    expect(others[0]!.title).toBe('F11')
  })

  it('réglages par conversation : taste éteint par défaut, gardé par « nouvelle conversation », valeur abîmée ignorée', async () => {
    const file = fresh()
    const store = new ChatStore(file)
    const a = await store.open('a')
    expect(await store.options('a', a.id)).toEqual({ taste: false })
    expect(await store.setOptions('a', a.id, { taste: true })).toEqual({ taste: true })
    const b = await store.open('b')
    expect(await store.options('b', b.id)).toEqual({ taste: false })
    // Conversation pas commencée mais ouverte avec des réglages : gardée.
    expect(await new ChatStore(file).options('a', a.id)).toEqual({ taste: true })
    await store.appendOrReplace('a', a.id, user('u1', 'Salut'))
    const { conversation } = await store.create('a')
    expect(await store.options('a', conversation.id)).toEqual({ taste: true })
    writeFileSync(file, JSON.stringify({ c: { sessionId: null, items: [user('u', 'x')], options: { taste: 'oui' } } }))
    const other = new ChatStore(file)
    expect(await other.options('c', (await other.open('c')).id)).toEqual({ taste: false })
  })

  it('titre automatique : premier message, espaces resserrés, images seules', () => {
    expect(autoTitle([])).toBeNull()
    expect(autoTitle([{ kind: 'assistant', id: 'a', text: 'x' }, user('u', '  Bonjour\n  le monde ')])).toBe('Bonjour le monde')
    expect(autoTitle([user('u', '', { images: 1 })])).toBe('Attached image')
    expect(autoTitle([user('u', '', { images: 3 })])).toBe('Attached images')
  })
})
