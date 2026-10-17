import { test, expect, type Page } from '@playwright/test'
import { launch } from './launch'

/** Une page de test : titre trop long (3 lignes et plus à 1440 px) au-dessus d'un petit texte. */
async function addBadPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): { ok: boolean; ids: Record<string, string> } } } }).__maquetteStore
    const pageId = store.getState().doc.pages[0]!.id
    const r = store.getState().dispatch(
      [
        { op: 'create', parent: pageId, node: { id: '$p', type: 'frame', name: 'Page test', x: 0, y: 0, width: 1440, height: 900, fills: ['#FFFFFF'], layout: { mode: 'auto', direction: 'column', gap: 24, padding: [120, 120, 120, 120] } } },
        { op: 'create', parent: '$p', node: { type: 'text', content: 'Une phrase beaucoup trop longue pour un titre de page qui devrait tenir sur deux lignes au plus selon les règles', fontSize: 80, fontWeight: 700, lineHeight: 88, width: 900, textSizing: 'auto-height' } },
        { op: 'create', parent: '$p', node: { type: 'text', content: 'Texte courant.', fontSize: 16 } },
      ],
      'test',
    )
    return r.ids.$p!
  })
}

test('taste-skill : trois directions puis la fiche complète', async () => {
  const { app, page } = await launch()
  try {
    const options = await page.evaluate(() => window.maquette.taste.options({ sector: 'restaurant', brief: 'bistrot de quartier à Charleroi' }))
    expect(options.ok).toBe(true)
    if (!options.ok) return
    expect(options.value).toHaveLength(3)
    const sheet = await page.evaluate((direction) => window.maquette.taste.direction({ sector: 'restaurant', brief: 'bistrot de quartier à Charleroi', direction }), options.value[0]!.id)
    expect(sheet.ok).toBe(true)
    if (sheet.ok) expect(sheet.value.palette.bg).toMatch(/^#/)
  } finally {
    await app.close()
  }
})

test('taste-skill : secteur inconnu, message clair', async () => {
  const { app, page } = await launch()
  try {
    const r = await page.evaluate(() => window.maquette.taste.options({ sector: 'pas-un-secteur', brief: 'x' }))
    expect(r.ok).toBe(false)
  } finally {
    await app.close()
  }
})

test('taste-skill : contrôle qualité d’une page', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const id = await addBadPage(page)
    const check = await page.evaluate((nodeId) => {
      const store = (window as unknown as { __maquetteStore: { getState(): { doc: unknown } } }).__maquetteStore
      return window.maquette.taste.check(store.getState().doc as never, nodeId)
    }, id)
    expect(check).not.toBeNull()
    expect(check!.isPage).toBe(true)
    expect(check!.findings.map((f) => f.id)).toContain('headline-lines')
  } finally {
    await app.close()
  }
})
