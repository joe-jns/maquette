import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseDocument } from '../../src/core/format'
import { preparePenImages, readPenForWindow, saveDefaultPath, withMaquetteExt } from '../../src/main/penOpen'
import { acceptPath, allowedSavePath, getImportedFrom, resetSession, savedTo, setPendingDir } from '../../src/main/state'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'maquette pen é '))
  resetSession()
})

const noNetwork = async (): Promise<Response> => {
  throw new Error('pas de réseau dans les tests')
}

describe('ouvrir un .pen (principal)', () => {
  it('« Enregistrer » propose <nom>.maquette dans le dossier du .pen ; jamais le .pen lui-même', () => {
    const pen = join(dir, 'Mon design.pen')
    expect(saveDefaultPath(pen)).toBe(join(dir, 'Mon design.maquette'))
    expect(saveDefaultPath(null)).toBe('Untitled.maquette')
    // Même si l'utilisateur tape le nom du .pen dans la boîte, la cible reste un .maquette.
    expect(withMaquetteExt(pen)).toBe(`${pen}.maquette`)
    expect(withMaquetteExt(join(dir, 'A.MAQUETTE'))).toBe(join(dir, 'A.MAQUETTE'))
  })

  it('un .pen converti n’est jamais le document courant : « Enregistrer » sans boîte refuse son chemin', async () => {
    const pen = join(dir, 'design.pen')
    const original = JSON.stringify({ version: '2.17', children: [{ type: 'frame', id: 'f', x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' }] })
    await writeFile(pen, original)
    const before = await stat(pen)
    setPendingDir(join(dir, 'pending'))
    const opened = await readPenForWindow(pen, noNetwork)
    expect(opened.path).toBeNull()
    expect(opened.imported).toMatchObject({ from: resolve(pen), name: 'design', report: [] })
    expect(parseDocument(opened.text).ok).toBe(true)
    expect(acceptPath(null, pen)).toBe(true)
    expect(getImportedFrom()).toBe(resolve(pen))
    expect(allowedSavePath(pen)).toBeNull()
    expect(allowedSavePath(null)).toBeNull()
    // Un .pen jamais lu pour la fenêtre n'est pas accepté comme origine.
    acceptPath(null, join(dir, 'autre.pen'))
    expect(getImportedFrom()).toBeNull()
    acceptPath(null, pen)
    savedTo(join(dir, 'design.maquette'))
    expect(getImportedFrom()).toBeNull()
    expect(allowedSavePath(pen)).toBeNull()
    // Le .pen est intact (lecture seule).
    expect(await readFile(pen, 'utf8')).toBe(original)
    expect((await stat(pen)).mtimeMs).toBe(before.mtimeMs)
  })

  it('images du .pen : chemins relatifs copiés dans le dossier d’attente ; introuvables absentes', async () => {
    await mkdir(join(dir, 'images'))
    await writeFile(join(dir, 'images', 'photo un.png'), PNG)
    await writeFile(join(dir, 'images', 'sans-extension'), PNG)
    const pending = join(dir, 'pending')
    const map = await preparePenImages(join(dir, 'x.pen'), ['images/photo un.png', 'images/photo%20un.png', './images/sans-extension', 'images/absente.png', 'https://example.com/a.png'], pending, noNetwork)
    expect(map.get('images/photo un.png')).toMatch(/^assets\/[0-9a-f]{16}\.png$/)
    expect(map.get('images/photo%20un.png')).toBe(map.get('images/photo un.png'))
    expect(map.get('./images/sans-extension')).toBe(map.get('images/photo un.png'))
    expect(map.has('images/absente.png')).toBe(false)
    expect(map.has('https://example.com/a.png')).toBe(false)
    expect(await readdir(join(pending, 'assets'))).toHaveLength(1)
  })

  it('un fichier qui n’est pas un .pen : erreur claire', async () => {
    const bad = join(dir, 'faux.pen')
    await writeFile(bad, 'binaire chiffré')
    await expect(readPenForWindow(bad, noNetwork)).rejects.toThrow(/not a readable Pen document/)
  })
})
