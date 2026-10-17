import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RecentStore, addRecent } from '../../src/main/recent'

const WIN = process.platform === 'win32'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'récents '))
})

describe('addRecent', () => {
  it('met le fichier en tête', () => {
    expect(addRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  it('sans doublon : un fichier déjà présent remonte en tête', () => {
    expect(addRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it.runIf(WIN)('casse ignorée sous Windows, la nouvelle écriture gagne', () => {
    expect(addRecent(['C:\\Sites\\Accueil.maquette', 'b'], 'c:\\sites\\accueil.maquette')).toEqual(['c:\\sites\\accueil.maquette', 'b'])
  })

  it('au plus max entrées', () => {
    const list = Array.from({ length: 10 }, (_, i) => `f${i}`)
    expect(addRecent(list, 'neuf')).toEqual(['neuf', ...list.slice(0, 9)])
    expect(addRecent(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a'])
  })

  it('ne modifie pas la liste reçue', () => {
    const list = ['a', 'b']
    addRecent(list, 'c')
    expect(list).toEqual(['a', 'b'])
  })
})

describe('RecentStore', () => {
  it('fichier absent : liste vide', async () => {
    expect(await new RecentStore(join(dir, 'recent.json')).list()).toEqual([])
  })

  it('aller-retour : ajout, relecture par une autre instance, retrait', async () => {
    const file = join(dir, 'recent.json')
    const store = new RecentStore(file)
    expect(await store.add('a.maquette')).toEqual(['a.maquette'])
    expect(await store.add('b.maquette')).toEqual(['b.maquette', 'a.maquette'])
    expect(await new RecentStore(file).list()).toEqual(['b.maquette', 'a.maquette'])
    expect(await store.remove('b.maquette')).toEqual(['a.maquette'])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['a.maquette'])
  })

  it.runIf(WIN)('retrait : casse ignorée sous Windows', async () => {
    const store = new RecentStore(join(dir, 'recent.json'))
    await store.add('C:\\A.maquette')
    expect(await store.remove('c:\\a.maquette')).toEqual([])
  })

  it('json corrompu ou mal formé : liste vide, puis réécrit proprement', async () => {
    const file = join(dir, 'recent.json')
    await writeFile(file, '{pas du json', 'utf8')
    const store = new RecentStore(file)
    expect(await store.list()).toEqual([])
    await writeFile(file, JSON.stringify({ a: 1 }), 'utf8')
    expect(await store.list()).toEqual([])
    await writeFile(file, JSON.stringify(['ok.maquette', 3, null]), 'utf8')
    expect(await store.list()).toEqual(['ok.maquette'])
    expect(await store.add('x.maquette')).toEqual(['x.maquette', 'ok.maquette'])
  })
})
