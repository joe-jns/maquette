import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BackupStore, backupId } from '../../src/main/backup'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'secours '))
})

const DOC = 'C:\\Users\\moi\\Site.maquette'
// Date de modification du fichier de l'utilisateur, simulée.
const mtime = (map: Record<string, number | null>) => async (p: string) => map[p] ?? null

describe('copies de secours', () => {
  it('écrit puis retrouve la copie (fichier enregistré avant la copie)', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: DOC, session: '1' }, '{"a":1}', 2000)
    const list = await store.pending(mtime({ [DOC]: 1000 }))
    expect(list).toEqual([{ id: backupId({ path: DOC, session: '1' }), path: DOC, savedAt: 2000, text: '{"a":1}' }])
    expect((await readdir(dir)).sort()).toEqual([`${list[0]!.id}.json`, `${list[0]!.id}.maquette`])
  })

  it('fichier enregistré après la copie : pas de proposition', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: DOC, session: '1' }, 'x', 2000)
    expect(await store.pending(mtime({ [DOC]: 3000 }))).toEqual([])
  })

  it('fichier disparu : la copie est gardée', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: DOC, session: '1' }, 'x', 2000)
    expect(await store.pending(mtime({}))).toHaveLength(1)
  })

  it('document sans titre : proposé, trié du plus récent au plus ancien', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: null, session: '111' }, 'ancien', 1000)
    await store.write({ path: null, session: '222' }, 'récent', 5000)
    const list = await store.pending(mtime({}))
    expect(list.map((b) => [b.id, b.path, b.text])).toEqual([
      ['sans-titre-222', null, 'récent'],
      ['sans-titre-111', null, 'ancien'],
    ])
  })

  it('réécrire la même clé remplace la copie', async () => {
    const store = new BackupStore(dir)
    const key = { path: null, session: '1' }
    await store.write(key, 'v1', 1000)
    await store.write(key, 'v2', 2000)
    const list = await store.pending(mtime({}))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ text: 'v2', savedAt: 2000 })
  })

  it('clear supprime les deux fichiers, sans erreur s’ils n’existent pas', async () => {
    const store = new BackupStore(dir)
    const key = { path: DOC, session: '1' }
    await store.write(key, 'x', 2000)
    await store.clear(key)
    expect(await readdir(dir)).toEqual([])
    await expect(store.clear(key)).resolves.toBeUndefined()
    await expect(new BackupStore(join(dir, 'absent')).clear(key)).resolves.toBeUndefined()
  })

  it('discard supprime la copie par son id', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: null, session: '9' }, 'x', 1000)
    await store.discard('sans-titre-9')
    expect(await store.pending(mtime({}))).toEqual([])
  })

  it('dossier absent : aucune copie, et write le crée', async () => {
    const store = new BackupStore(join(dir, 'pas', 'encore'))
    expect(await store.pending(mtime({}))).toEqual([])
    await store.write({ path: null, session: '1' }, 'x', 1000)
    expect(await store.pending(mtime({}))).toHaveLength(1)
  })

  it('json corrompu ou texte manquant : ignoré sans planter, et supprimé', async () => {
    const store = new BackupStore(dir)
    await store.write({ path: null, session: 'ok' }, 'bon', 1000)
    await writeFile(join(dir, 'casse.json'), '{pas du json', 'utf8')
    await writeFile(join(dir, 'casse.maquette'), 'x', 'utf8')
    await writeFile(join(dir, 'forme.json'), '{"path":3,"savedAt":"hier"}', 'utf8')
    await writeFile(join(dir, 'seul.json'), '{"path":null,"savedAt":1}', 'utf8')
    const list = await store.pending(mtime({}))
    expect(list.map((b) => b.id)).toEqual(['sans-titre-ok'])
    expect((await readdir(dir)).sort()).toEqual(['sans-titre-ok.json', 'sans-titre-ok.maquette'])
  })

  it('id : 16 hexadécimaux pour un chemin, session nettoyée sinon', () => {
    expect(backupId({ path: DOC, session: '1' })).toMatch(/^[0-9a-f]{16}$/)
    expect(backupId({ path: null, session: '1760000000000' })).toBe('sans-titre-1760000000000')
    expect(backupId({ path: null, session: '../x' })).toBe('sans-titre-___x')
  })

  it.runIf(process.platform === 'win32')('sous Windows, deux chemins qui ne diffèrent que par la casse ont le même id', async () => {
    expect(backupId({ path: DOC, session: '1' })).toBe(backupId({ path: DOC.toUpperCase(), session: '2' }))
    const store = new BackupStore(dir)
    await store.write({ path: DOC, session: '1' }, 'v1', 1000)
    await store.write({ path: DOC.toLowerCase(), session: '1' }, 'v2', 2000)
    expect(await store.pending(mtime({}))).toHaveLength(1)
  })
})
