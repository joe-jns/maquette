import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCredits, saveFound } from '../../src/main/imageCredits'
import type { FoundImage } from '../../src/main/imageSources'

const photo: FoundImage = {
  ref: 'openverse:aaa-111', source: 'openverse', title: 'Pain au levain', creator: 'Marie', licence: 'by', licenceVersion: '2.0',
  licenceName: null, licenceUrl: null, page: 'https://www.flickr.com/photos/x/1', via: 'Flickr', image: 'https://x/pain.jpg', thumb: null, width: 1600, height: 1067,
}
const bytes = new Uint8Array([1, 2, 3, 4])

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'credits é '))
})

describe('crédits des photos', () => {
  it('enregistre le fichier dans assets/ et son crédit dans assets/credits.json (format taste-skill)', async () => {
    const { src, entry } = await saveFound(dir, photo, { bytes, ext: 'jpg', width: 1600, height: 1067 })
    expect(src).toMatch(/^assets\/pain-au-levain-[0-9a-f]{8}\.jpg$/)
    expect(await readFile(join(dir, src))).toEqual(Buffer.from(bytes))
    expect(entry).toMatchObject({
      file: src, media: 'image', ref: 'openverse:aaa-111', license: 'CC BY 2.0', licenseCode: 'by',
      licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', creditRequired: true, page: photo.page, via: 'Flickr',
      credit: '« Pain au levain » par Marie, CC BY 2.0, via Flickr', width: 1600, height: 1067, bytes: 4,
    })
    expect(await readCredits(dir)).toEqual([entry])
  })

  it('la même photo posée deux fois : un seul fichier, une seule entrée ; les autres entrées restent', async () => {
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets', 'credits.json'), JSON.stringify([{ file: 'assets/autre.jpg', credit: 'x' }]))
    await saveFound(dir, photo, { bytes, ext: 'jpg', width: 1, height: 1 })
    await saveFound(dir, photo, { bytes, ext: 'jpg', width: 1, height: 1 })
    expect((await readdir(join(dir, 'assets'))).filter((f) => f.endsWith('.jpg'))).toHaveLength(1)
    expect((await readCredits(dir)).map((c) => c.file)).toEqual(['assets/autre.jpg', expect.stringMatching(/^assets\/pain-au-levain-/)])
  })

  it('refuse une licence non commerciale', async () => {
    await expect(saveFound(dir, { ...photo, licence: 'by-nc' }, { bytes, ext: 'jpg', width: 1, height: 1 })).rejects.toThrow('CC BY-NC 2.0')
    expect(await readCredits(dir)).toEqual([])
  })

  it('fichier de crédits absent ou abîmé : liste vide', async () => {
    expect(await readCredits(dir)).toEqual([])
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets', 'credits.json'), '{pas du json')
    expect(await readCredits(dir)).toEqual([])
  })
})
