import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileWatcher } from '../../src/main/watch'
import { writeFileAtomic } from '../../src/main/files'

// Attentes larges : fs.watch peut tarder sous Windows, le test ne doit pas clignoter.
const DEBOUNCE = 100
const SETTLE = 800
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let dir: string
let file: string
let calls: string[]
let watcher: FileWatcher

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'surveillance '))
  file = join(dir, 'Accueil.maquette')
  await writeFile(file, 'v0', 'utf8')
  calls = []
  watcher = new FileWatcher((p) => calls.push(p), { debounceMs: DEBOUNCE })
  watcher.wrote('v0')
  watcher.watch(file)
  await sleep(100)
})

afterEach(async () => {
  watcher.close()
  await rm(dir, { recursive: true, force: true })
})

describe('FileWatcher', () => {
  it('écriture extérieure : un appel avec le chemin', async () => {
    await writeFile(file, 'v1', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([file])
  })

  it('notre propre écriture (wrote du même texte) : aucun appel', async () => {
    watcher.wrote('v1')
    await writeFile(file, 'v1', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([])
  })

  it('notre enregistrement atomique (temporaire + renommage) : aucun appel, puis la surveillance continue', async () => {
    watcher.wrote('v1')
    await writeFileAtomic(file, 'v1')
    await sleep(SETTLE)
    expect(calls).toEqual([])
    await writeFile(file, 'v2', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([file])
  })

  it('écriture extérieure atomique : détectée, et la suivante aussi', async () => {
    await writeFileAtomic(file, 'v1')
    await sleep(SETTLE)
    expect(calls).toEqual([file])
    await writeFileAtomic(file, 'v2')
    await sleep(SETTLE)
    expect(calls).toEqual([file, file])
  })

  it('trois écritures rapides : un seul appel', async () => {
    await writeFile(file, 'a', 'utf8')
    await writeFile(file, 'b', 'utf8')
    await writeFile(file, 'c', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([file])
  })

  it('un autre fichier du dossier : aucun appel', async () => {
    await writeFile(join(dir, 'autre.maquette'), 'x', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([])
  })

  it('fichier supprimé : rien', async () => {
    await rm(file)
    await sleep(SETTLE)
    expect(calls).toEqual([])
  })

  it('watch(null) puis close : plus aucun appel', async () => {
    watcher.watch(null)
    await writeFile(file, 'v1', 'utf8')
    await sleep(SETTLE)
    watcher.watch(file)
    watcher.close()
    await writeFile(file, 'v2', 'utf8')
    await sleep(SETTLE)
    expect(calls).toEqual([])
  })

  it('lecture injectée : sert à comparer le contenu', async () => {
    watcher.close()
    const seen: string[] = []
    const w = new FileWatcher((p) => seen.push(p), { debounceMs: DEBOUNCE, read: async () => 'v0' })
    w.wrote('v0')
    w.watch(file)
    await sleep(100)
    await writeFile(file, 'v1', 'utf8')
    await sleep(SETTLE)
    w.close()
    expect(seen).toEqual([])
  })
})
