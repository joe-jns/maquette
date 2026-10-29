import { test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { launch } from '../e2e/launch'

/**
 * Comparaison visuelle de l'import Pen (à la demande, hors suite) : ouvre chaque .pen de PEN_FILES
 * (séparés par « ; », lus seulement) dans l'app hors écran et rend chaque calque de premier niveau par
 * l'export PNG de l'app (fenêtre cachée), au facteur PEN_SCALE (2 par défaut). Écrit dans PEN_OUT :
 * <nom>/<id>.png et <nom>/layout.json (position et taille de chaque calque), pour l'assemblage.
 *   PEN_FILES="C:\...\a.pen;C:\...\b.pen" PEN_OUT=... npx playwright test -c bench bench/pen-compare.spec.ts
 */
const files = (process.env.PEN_FILES ?? '').split(';').filter(Boolean)
const out = process.env.PEN_OUT ?? 'tmp/pen-compare'
const scale = Number(process.env.PEN_SCALE ?? 2)

for (const file of files) {
  test(`rendu de ${basename(file)}`, async () => {
    test.setTimeout(240_000)
    const { app, page } = await launch([file])
    try {
      await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click({ timeout: 60_000 }).catch(() => undefined)
      // Polices et images : le temps qu'elles arrivent (le rendu de l'export attend aussi les siennes).
      await page.waitForTimeout(3000)
      const dir = join(out, basename(file).replace(/\.pen$/i, ''))
      mkdirSync(dir, { recursive: true })
      const nodes = await page.evaluate(() => {
        const s = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: { id: string; name: string; x?: number; y?: number; visible: boolean }[] }[] } } } }).__maquetteStore.getState()
        return s.doc.pages[0]!.children.filter((n) => n.visible).map((n) => ({ id: n.id, name: n.name, x: n.x ?? 0, y: n.y ?? 0 }))
      })
      const layout: { id: string; name: string; x: number; y: number; width: number; height: number }[] = []
      for (const n of nodes) {
        const img = await page.evaluate(async ({ id, scale }) => {
          const s = (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore.getState()
          return window.maquette.renderNode(s.doc as never, id, { scale, format: 'png' })
        }, { id: n.id, scale })
        if (!img) continue
        writeFileSync(join(dir, `${n.id}.png`), Buffer.from(img.data, 'base64'))
        layout.push({ ...n, width: img.width, height: img.height })
      }
      writeFileSync(join(dir, 'layout.json'), JSON.stringify({ scale, layout }, null, 2))
    } finally {
      await app.close()
    }
  })
}
