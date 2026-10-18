import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatImages, imageFile, imageHashes, PRUNE_GRACE_MS, thumbScale, type MakeThumb } from '../../src/main/chat/chatImages'
import { ChatStore } from '../../src/main/chat/chatStore'
import { chatImageUrl, type ChatItem } from '../../src/shared/chat'

const fresh = () => mkdtempSync(join(tmpdir(), 'maquette-chat-img-'))
/** Fausse réduction : « JPEG » = les octets reçus, 640 × 400 ; « illisible » refusé. */
const fakeThumb: MakeThumb = (bytes) => (bytes.toString() === 'illisible' ? null : { jpeg: Buffer.concat([Buffer.from('jpg:'), bytes]), width: 640, height: 400 })
const b64 = (s: string) => Buffer.from(s).toString('base64')
const H = (c: string) => c.repeat(64)

describe('vignettes du chat', () => {
  it('nom tiré de l’empreinte : la même image ne fait qu’un fichier', async () => {
    const dir = join(fresh(), 'chat-images')
    const images = new ChatImages(dir, fakeThumb)
    const a = await images.save({ mediaType: 'image/png', data: b64('image A') })
    const again = await images.save({ mediaType: 'image/png', data: b64('image A') })
    expect(a).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), width: 640, height: 400 })
    expect(again).toEqual(a)
    expect(readdirSync(dir)).toEqual([`${a!.hash}.jpg`])
    expect(readFileSync(join(dir, `${a!.hash}.jpg`), 'utf8')).toBe('jpg:image A')
    expect(chatImageUrl(a!.hash)).toBe(`maquette-chat://img/${a!.hash}.jpg`)
  })

  it('images illisibles ou vides omises', async () => {
    const images = new ChatImages(fresh(), fakeThumb)
    expect(await images.save({ mediaType: 'image/png', data: b64('illisible') })).toBeNull()
    expect(await images.save({ mediaType: 'image/png', data: '' })).toBeNull()
    const refs = await images.saveAll([{ mediaType: 'image/png', data: b64('illisible') }, { mediaType: 'image/png', data: b64('B') }])
    expect(refs).toHaveLength(1)
  })

  it('réduction : 640 de large et 1600 de haut au plus, jamais agrandie', () => {
    expect(thumbScale(1280, 800)).toBe(0.5)
    expect(thumbScale(320, 200)).toBe(1)
    expect(thumbScale(640, 6400)).toBe(0.25)
  })

  it('ne sert que des empreintes du dossier : pas de traversée de chemin', () => {
    const dir = join('C:', 'data', 'chat-images')
    expect(imageFile(dir, `/${H('a')}.jpg`)).toBe(join(dir, `${H('a')}.jpg`))
    for (const bad of ['/../chats.json', `/${H('a')}.png`, `/${H('A')}.jpg`, `/x/${H('a')}.jpg`, '/..%2Fchats.json', `/${H('a').slice(1)}.jpg`, '/']) {
      expect(imageFile(dir, bad)).toBeNull()
    }
  })

  it('empreintes des éléments : vignettes jointes et images des outils, ancien historique sans rien', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: 'a', images: 2, thumbs: [{ hash: H('a'), width: 1, height: 1 }, { hash: H('b'), width: 1, height: 1 }] },
      { kind: 'user', id: 'u0', text: 'ancien', images: 1 },
      { kind: 'tool', id: 't1', name: 'capture', summary: '', status: 'done', images: [{ hash: H('c'), width: 1, height: 1 }] },
      { kind: 'tool', id: 't2', name: 'Bash', summary: '', status: 'done' },
      { kind: 'user', id: 'u2', text: 'abîmé', images: 1, thumbs: [{ hash: '../x', width: 1, height: 1 }] },
    ]
    expect(imageHashes(items)).toEqual([H('a'), H('b'), H('c')])
  })

  it('remove et prune : orphelines supprimées après une minute, les autres gardées', async () => {
    const dir = fresh()
    const images = new ChatImages(dir, fakeThumb)
    for (const c of 'abcd') writeFileSync(join(dir, `${H(c)}.jpg`), 'x')
    writeFileSync(join(dir, 'reste.tmp'), 'x')
    writeFileSync(join(dir, 'autre.txt'), 'x')
    await images.remove([H('d'), '../autre.txt'])
    const old = (Date.now() - PRUNE_GRACE_MS - 1000) / 1000
    for (const name of [`${H('a')}.jpg`, `${H('b')}.jpg`, 'reste.tmp']) utimesSync(join(dir, name), old, old)
    // c est orpheline mais récente : un message en cours d'envoi peut l'utiliser.
    await images.prune(new Set([H('a')]))
    expect(readdirSync(dir).sort()).toEqual([`${H('a')}.jpg`, `${H('c')}.jpg`, 'autre.txt'].sort())
  })

  it('l’historique liste les vignettes utilisées, sauf celles d’une conversation donnée', async () => {
    const store = new ChatStore(join(fresh(), 'chats.json'))
    const c1 = (await store.open('k1')).id
    const c2 = (await store.open('k2')).id
    await store.appendOrReplace('k1', c1, { kind: 'user', id: 'u1', text: 'a', images: 1, thumbs: [{ hash: H('a'), width: 1, height: 1 }] })
    await store.appendOrReplace('k2', c2, { kind: 'tool', id: 't1', name: 'capture', summary: '', status: 'done', images: [{ hash: H('b'), width: 1, height: 1 }] })
    // Une autre conversation du même fichier compte aussi.
    const c3 = (await store.create('k1')).conversation.id
    await store.appendOrReplace('k1', c3, { kind: 'user', id: 'u2', text: 'b', images: 1, thumbs: [{ hash: H('c'), width: 1, height: 1 }] })
    expect([...(await store.images())].sort()).toEqual([H('a'), H('b'), H('c')].sort())
    expect([...(await store.images({ key: 'k1', id: c1 }))].sort()).toEqual([H('b'), H('c')].sort())
  })
})
