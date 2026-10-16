import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, readdir, writeFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic, type FsLike } from '../../src/main/files'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'maquette dossier é '))
})

const busy = () => Object.assign(new Error('occupé'), { code: 'EBUSY' })

describe('writeFileAtomic', () => {
  it('écrit le fichier sans laisser de temporaire, même avec espaces et accents', async () => {
    const target = join(dir, 'démo test.maquette')
    await writeFileAtomic(target, 'Été 🌿\n')
    expect(await readFile(target, 'utf8')).toBe('Été 🌿\n')
    expect(await readdir(dir)).toEqual(['démo test.maquette'])
  })

  it('réessaie quand le renommage est bloqué (antivirus)', async () => {
    const target = join(dir, 'a.maquette')
    let failures = 2
    const fs: FsLike = {
      writeFile, rm,
      rename: async (from, to) => {
        if (failures-- > 0) throw busy()
        await rename(from, to)
      },
    }
    await writeFileAtomic(target, 'ok', { fs, delayMs: 1 })
    expect(await readFile(target, 'utf8')).toBe('ok')
  })

  it('abandonne après les nouvelles tentatives : l’original reste intact, le temporaire est supprimé', async () => {
    const target = join(dir, 'a.maquette')
    await writeFile(target, 'original', 'utf8')
    const fs: FsLike = { writeFile, rm, rename: async () => { throw busy() } }
    await expect(writeFileAtomic(target, 'nouveau', { fs, retries: 3, delayMs: 1 })).rejects.toThrow('occupé')
    expect(await readFile(target, 'utf8')).toBe('original')
    expect(await readdir(dir)).toEqual(['a.maquette'])
  })

  it('une autre erreur n’est pas réessayée', async () => {
    let calls = 0
    const fs: FsLike = {
      writeFile, rm,
      rename: async () => {
        calls++
        throw Object.assign(new Error('disque plein'), { code: 'ENOSPC' })
      },
    }
    await expect(writeFileAtomic(join(dir, 'a.maquette'), 'x', { fs, delayMs: 1 })).rejects.toThrow('disque plein')
    expect(calls).toBe(1)
  })
})
