import { test, expect } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'
import { centerOf, docNode, settled } from './canvas'

/** Un cadre automatique en ligne avec retour à la ligne contenant 2 000 rectangles, plus un rectangle libre. */
async function heavyDocument(): Promise<string> {
  const base = { visible: true, locked: false, opacity: 1, position: 'flow' }
  const children = Array.from({ length: 2000 }, (_, i) => ({
    ...base, id: `r${String(i).padStart(5, '0')}`, type: 'shape', name: `R${i}`, width: 30, height: 30,
    shape: 'rectangle', fills: [i % 2 ? '#93C5FD' : '#FCA5A5'], radius: 4, shadows: [],
  }))
  const doc = {
    format: 'maquette', version: 1, styles: { colors: [], text: [] },
    pages: [{ id: 'pCharge', name: 'Charge', children: [
      { ...base, id: 'fGrille', type: 'frame', name: 'Grille', width: 1700, height: { mode: 'hug' }, x: 0, y: 0, children,
        layout: { mode: 'auto', direction: 'row', gap: 4, padding: [16, 16, 16, 16], justify: 'start', align: 'start', wrap: true, reverseZ: false },
        fills: ['#FFFFFF'], radius: 0, shadows: [], clip: false },
      { ...base, id: 'rSeul1', type: 'shape', name: 'Seul', width: 120, height: 120, x: 1800, y: 0, shape: 'rectangle', fills: ['#86EFAC'], radius: 0, shadows: [] },
    ] }],
  }
  const dir = await mkdtemp(join(tmpdir(), 'charge '))
  const file = join(dir, 'charge-2000.maquette')
  await writeFile(file, JSON.stringify(doc), 'utf8')
  return file
}

test('2 000 éléments : zoom et glisser restent fluides', async () => {
  test.setTimeout(60_000)
  const { app, page } = await launch([await heavyDocument()])
  await settled(page, 'rSeul1')
  const before = await page.getByTestId('zoom').textContent()

  const c = await centerOf(page, 'rSeul1')
  await page.mouse.move(c.x, c.y)
  const t0 = Date.now()
  await page.keyboard.down('Control')
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -60 : 60)
  await page.keyboard.up('Control')
  const zoomMs = Date.now() - t0
  await expect(page.getByTestId('zoom')).not.toHaveText('')
  console.log(`20 crans de zoom : ${zoomMs} ms (avant : ${before})`)
  expect(zoomMs).toBeLessThan(2000)

  const s = await centerOf(page, 'rSeul1')
  const t1 = Date.now()
  await page.keyboard.down('Control')
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(s.x + 200, s.y, { steps: 20 })
  await page.mouse.up()
  await page.keyboard.up('Control')
  const dragMs = Date.now() - t1
  console.log(`glisser sur 200 px en 20 étapes : ${dragMs} ms`)
  expect(dragMs).toBeLessThan(3000)
  expect(((await docNode(page, 'rSeul1')) as { x: number }).x).toBeGreaterThan(1800)
  await app.close()
})
