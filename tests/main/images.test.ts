import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importImage, MAX_IMAGE_BYTES } from '../../src/main/images'

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'images é '))
})

describe('importImage', () => {
  it('copie l’image dans assets/ sous un nom tiré de son empreinte', async () => {
    const { src } = await importImage(dir, 'Photo été.PNG', PNG_1x1)
    expect(src).toMatch(/^assets\/[0-9a-f]{16}\.png$/)
    expect(await readFile(join(dir, src))).toEqual(PNG_1x1)
  })

  it('la même image importée deux fois ne crée pas de doublon', async () => {
    const a = await importImage(dir, 'a.png', PNG_1x1)
    const b = await importImage(dir, 'copie.png', PNG_1x1)
    expect(b.src).toBe(a.src)
    expect(await readdir(join(dir, 'assets'))).toHaveLength(1)
  })

  it('refuse un format non pris en charge', async () => {
    await expect(importImage(dir, 'image.bmp', PNG_1x1)).rejects.toThrow('Format d’image non pris en charge : .bmp')
    await expect(importImage(dir, 'sans-extension', PNG_1x1)).rejects.toThrow('Format d’image non pris en charge')
  })

  it('refuse une image de plus de 50 Mo', async () => {
    await expect(importImage(dir, 'grosse.png', new Uint8Array(MAX_IMAGE_BYTES + 1))).rejects.toThrow('Image trop lourde')
  })
})
