import { test, expect } from '@playwright/test'
import { docNode, scene } from './canvas'
import { launch } from './launch'

const shots = process.env.MAQUETTE_SHOTS

test('onglet Direction : tirer, choisir, appliquer, annuler en une fois', async () => {
  const { app, page } = await launch([scene])
  try {
    await page.getByRole('tab', { name: 'Direction' }).click()
    await page.getByRole('combobox', { name: 'Secteur' }).click()
    await page.getByRole('option', { name: 'Restaurant', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Secteur' })).toHaveText('Restaurant')
    await page.getByLabel('Brief en une phrase').fill('Bistrot de quartier à Charleroi, cuisine du marché')
    await page.getByRole('button', { name: 'Tirer 3 directions' }).click()
    const cards = page.locator('.direction-card')
    await expect(cards).toHaveCount(3)
    if (shots) await page.screenshot({ path: `${shots}/direction-cartes.png` })
    await cards.first().getByRole('button', { name: /^Choisir/ }).click()
    await expect(page.getByRole('button', { name: 'Appliquer au document' })).toBeVisible()
    await page.waitForTimeout(800)
    if (shots) await page.screenshot({ path: `${shots}/direction-fiche.png` })
    await page.getByRole('button', { name: 'Appliquer au document' }).click()

    const styles = () => page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { doc: { styles: { colors: { name: string }[]; text: { name: string }[] } } } } }).__maquetteStore.getState().doc.styles)
    const after = await styles()
    expect(after.colors.map((c) => c.name)).toEqual(expect.arrayContaining(['Fond', 'Accent']))
    expect(after.text.map((t) => t.name)).toContain('Titre 1')

    await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+z')
    const undone = await styles()
    expect(undone.colors.map((c) => c.name)).not.toContain('Fond')
    expect(undone.text.map((t) => t.name)).not.toContain('Titre 1')
  } finally {
    await app.close()
  }
})

test('contrôle qualité : fautes listées, épingles sur le canevas, clic = sélection', async () => {
  const { app, page } = await launch([scene])
  try {
    await expect(page.getByTestId('canvas')).toBeVisible()
    const id = await page.evaluate(() => {
      const store = (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): { ids: Record<string, string> } } } }).__maquetteStore
      const r = store.getState().dispatch(
        [
          { op: 'create', parent: store.getState().doc.pages[0]!.id, node: { id: '$p', type: 'frame', name: 'Page test', x: 0, y: 1400, width: 1440, height: 900, fills: ['#FFFFFF'], layout: { mode: 'auto', direction: 'column', gap: 24, padding: [120, 120, 120, 120] } } },
          { op: 'create', parent: '$p', node: { type: 'text', content: 'Une phrase beaucoup trop longue pour un titre de page qui devrait tenir sur deux lignes au plus', fontSize: 80, fontWeight: 700, lineHeight: 88, width: 900, textSizing: 'auto-height' } },
        ],
        'test',
      )
      return r.ids.$p!
    })
    await page.evaluate((nodeId) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void; requestFit(): void } } }).__maquetteUi.getState().select([nodeId]), id)
    await page.keyboard.press('Shift+2')
    await page.keyboard.press('Control+Alt+v')
    const findings = page.locator('.finding')
    await expect(findings.first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.finding strong', { hasText: 'headline-lines' })).toBeVisible()
    await expect(page.getByTestId('taste-pins').locator('button').first()).toBeVisible()
    if (shots) await page.screenshot({ path: `${shots}/controle.png` })

    await page.locator('.finding', { hasText: 'headline-lines' }).click()
    const selected = await page.evaluate(() => (window as unknown as { __maquetteUi: { getState(): { selection: string[] } } }).__maquetteUi.getState().selection)
    expect(selected).toHaveLength(1)
    expect(((await docNode(page, selected[0]!)) as { type?: string } | undefined)?.type).toBe('text')
  } finally {
    await app.close()
  }
})
