import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_AUTO, VersionStore } from '../../src/main/versions'
import { thumbHash } from '../../src/main/thumbModel'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'versions '))
})

const DOC = join(tmpdir(), 'Site.maquette')
const OTHER = join(tmpdir(), 'Autre site.maquette')

describe('versions', () => {
  it('enregistre, liste (plus récente d’abord), relit', async () => {
    const store = new VersionStore(dir)
    const a = await store.add(DOC, '{"a":1}', { name: 'Première', auto: false }, 1000)
    const b = await store.add(DOC, '{"b":2}', { name: '  Avant   Claude ', auto: true }, 2000)
    expect(b.name).toBe('Avant Claude')
    expect(a.size).toBe(7)
    expect((await store.list(DOC)).map((v) => v.id)).toEqual([b.id, a.id])
    expect(await store.read(DOC, a.id)).toBe('{"a":1}')
    expect(await store.read(DOC, 'absent-1')).toBeNull()
    expect(await store.read(DOC, '../../etc')).toBeNull()
    expect(await store.list(OTHER)).toEqual([])
    const files = await readdir(join(dir, thumbHash(DOC)))
    expect(files.sort()).toEqual([`${a.id}.maquette`, `${b.id}.maquette`, 'index.json'].sort())
  })

  it(`garde ${MAX_AUTO} versions automatiques au plus, n’efface jamais les nommées`, async () => {
    const store = new VersionStore(dir)
    const named = await store.add(DOC, 'n', { name: 'Gardée', auto: false }, 1)
    const first = await store.add(DOC, 'a0', { name: 'Auto 0', auto: true }, 2)
    for (let i = 1; i <= MAX_AUTO; i++) await store.add(DOC, `a${i}`, { name: `Auto ${i}`, auto: true }, 2 + i)
    const list = await store.list(DOC)
    expect(list.filter((v) => v.auto)).toHaveLength(MAX_AUTO)
    expect(list.some((v) => v.id === named.id)).toBe(true)
    expect(list.some((v) => v.id === first.id)).toBe(false)
    expect(await store.read(DOC, first.id)).toBeNull()
    expect(await readdir(join(dir, thumbHash(DOC)))).not.toContain(`${first.id}.maquette`)
  })

  it('renomme et supprime', async () => {
    const store = new VersionStore(dir)
    const v = await store.add(DOC, 'x', { name: 'Avant', auto: true }, 1)
    expect(await store.rename(DOC, v.id, 'Après')).toBe(true)
    expect((await store.list(DOC))[0]!.name).toBe('Après')
    expect(await store.rename(DOC, 'zz-zz', 'rien')).toBe(false)
    expect(await store.remove(DOC, v.id)).toBe(true)
    expect(await store.list(DOC)).toEqual([])
    expect(await store.remove(DOC, v.id)).toBe(false)
    expect(await readdir(join(dir, thumbHash(DOC)))).toEqual(['index.json'])
  })

  it('« Enregistrer sous » : les versions suivent, ajoutées à celles du nouveau chemin', async () => {
    const store = new VersionStore(dir)
    const a = await store.add(DOC, 'a', { name: 'A', auto: false }, 1)
    const c = await store.add(OTHER, 'c', { name: 'C', auto: true }, 3)
    const b = await store.add(DOC, 'b', { name: 'B', auto: true }, 2)
    await store.copy(DOC, OTHER)
    expect((await store.list(OTHER)).map((v) => v.id)).toEqual([c.id, b.id, a.id])
    expect(await store.read(OTHER, a.id)).toBe('a')
    // L'ancien chemin garde les siennes ; recopier ne double rien.
    expect(await store.list(DOC)).toHaveLength(2)
    await store.copy(DOC, OTHER)
    expect(await store.list(OTHER)).toHaveLength(3)
    expect(JSON.parse(await readFile(join(dir, thumbHash(OTHER), 'index.json'), 'utf8'))).toHaveLength(3)
  })
})
