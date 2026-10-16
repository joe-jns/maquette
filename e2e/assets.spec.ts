import { test, expect } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const image = (id: string, src: string, x: number) => ({
  id, type: 'image', name: id, visible: true, locked: false, opacity: 1,
  width: 40, height: 40, x, y: 10, position: 'flow', src, fit: 'cover', radius: 0, shadows: [],
})

test('une image du dossier assets s’affiche ; une image absente est signalée', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'images é '))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'assets', 'point é.png'), Buffer.from(PNG_1x1, 'base64'))
  const doc = {
    format: 'maquette', version: 1, styles: { colors: [], text: [] },
    pages: [{ id: 'pImage', name: 'Images', children: [image('iPoint', 'assets/point é.png', 10), image('iAbsen', 'assets/absente.png', 80)] }],
  }
  const file = join(dir, 'images.maquette')
  await writeFile(file, JSON.stringify(doc), 'utf8')

  const { app, page } = await launch([file])
  const img = page.locator('img[data-node-id="iPoint"]')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
  await expect(page.locator('[data-node-id="iAbsen"]')).toHaveText('Image introuvable')
  await app.close()
})
