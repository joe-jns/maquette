import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { emit, engineSetup, fakeChat, reopen } from '../e2e/chat'

/**
 * Captures de tous les états de l'interface, pour relire le design (phase polish).
 * npx electron-vite build && SHOTS=<dossier> npx playwright test -c e2e-shots
 */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const scene = resolve('e2e/fixtures/scene.maquette')

async function open(args: string[] = [], extraEnv: Record<string, string> = {}) {
  const app = await electron.launch({
    args: ['.', ...args],
    env: { ...process.env, MAQUETTE_E2E: '1', MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-shots-')), ...extraEnv },
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(600)
  return { app, page }
}
const select = (page: Page, ids: string[]) =>
  page.evaluate((s) => (window as unknown as { __maquetteUi: { getState(): { select(ids: string[]): void } } }).__maquetteUi.getState().select(s), ids)
const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) })

test('états de l’interface', async () => {
  test.setTimeout(120_000)
  const empty = await open()
  await shot(empty.page, '01-nouveau')
  await empty.app.close()

  const { app, page } = await open([scene])
  await shot(page, '02-document')
  await select(page, ['tTitre'])
  await page.waitForTimeout(300)
  await shot(page, '03-texte')
  await page.locator('.panel-right').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await shot(page, '04-texte-bas')
  await select(page, ['fHero1'])
  await page.waitForTimeout(300)
  await shot(page, '05-cadre-auto')
  await select(page, ['rBleu1'])
  await page.waitForTimeout(300)
  await shot(page, '06-rectangle')
  // Calques : un cadre sélectionné, ses enfants teintés en bloc.
  await select(page, ['tSuite'])
  await select(page, ['fHero1'])
  await page.waitForTimeout(300)
  await shot(page, '16-calques-enfants')
  await page.getByRole('button', { name: 'Formes' }).click()
  await page.waitForTimeout(200)
  await shot(page, '17-sous-menu-formes')
  await page.keyboard.press('Escape')
  await page.getByTestId('zoom').click()
  await page.waitForTimeout(200)
  await shot(page, '18-menu-zoom')
  await page.keyboard.press('Escape')
  await page.getByTestId('file-header').getByRole('button').click()
  await page.waitForTimeout(200)
  await shot(page, '19-menu-fichier')
  await page.keyboard.press('Escape')
  await select(page, ['tTitre'])
  await page.locator('[data-font-trigger]').first().click()
  await page.waitForTimeout(500)
  await shot(page, '07-polices')
  await page.keyboard.press('Escape')
  // Liste déroulante maison ouverte (graisse), puis plusieurs éléments et l'alignement.
  await page.getByRole('combobox', { name: 'Graisse', exact: true }).click()
  await page.waitForTimeout(200)
  await shot(page, '16-liste-ouverte')
  await page.keyboard.press('Escape')
  await select(page, ['rBleu1', 'rVert1', 'fLibre'])
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Aligner en haut' }).hover()
  await shot(page, '17-alignement')
  await select(page, ['fHero1'])
  await page.waitForTimeout(300)
  await page.getByRole('combobox', { name: 'Largeur : mode' }).click()
  await page.waitForTimeout(200)
  await shot(page, '18-mode-taille')
  await page.keyboard.press('Escape')
  // Contour, ombre, couleur nommée et style de texte : les rangées les plus chargées du panneau.
  await page.evaluate(() => {
    const store = (window as unknown as { __maquetteStore: { getState(): { dispatch(ops: unknown[], label: string): unknown } } }).__maquetteStore
    store.getState().dispatch([
      { op: 'style.color.set', id: '$c', name: 'Accent', value: '#C2410C' },
      { op: 'style.text.set', id: '$t', name: 'Titre 1', fontFamily: 'Inter', fontWeight: 700, fontStyle: 'normal', fontSize: 40, lineHeight: 48, letterSpacing: 0 },
      { op: 'update', id: 'rBleu1', set: { stroke: { color: { style: '$c' }, width: 2, align: 'inside' }, shadows: [{ x: 0, y: 4, blur: 12, spread: 0, color: '#00000026', inset: true }] } },
    ], 'capture')
  })
  await select(page, ['rBleu1'])
  await page.waitForTimeout(300)
  await shot(page, '19-contour-ombre')
  await select(page, [])
  await page.waitForTimeout(300)
  await shot(page, '20-styles-document')
  await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { undo(): void } } }).__maquetteStore.getState().undo())
  await page.getByRole('tab', { name: 'Direction' }).click()
  await shot(page, '08-direction')
  await page.getByRole('tab', { name: 'Design' }).click()
  await select(page, [])
  await page.locator('.page-list li').first().click({ button: 'right' })
  await shot(page, '09-menu-contextuel')
  await page.keyboard.press('Escape')
  await page.locator('.canvas').click({ position: { x: 600, y: 700 } })
  await page.keyboard.press('?')
  await page.waitForTimeout(300)
  await shot(page, '10-aide')
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { showError(m: string): void } } }).__maquetteStore.getState().showError('Impossible d’ouvrir site.maquette : version future du format'))
  await shot(page, '11-bandeau')
  await page.getByRole('alert').getByRole('button', { name: 'Fermer' }).click()
  await page.locator('[data-tool-button="rect"]').hover()
  await page.waitForTimeout(700)
  await shot(page, '15-infobulle')
  await page.mouse.move(700, 450)
  const blue = (await page.locator('[data-node-id="rBleu1"]').boundingBox())!
  await page.mouse.click(blue.x + blue.width / 2, blue.y + blue.height / 2, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Exporter en PNG', exact: true }).hover()
  await page.waitForTimeout(200)
  await shot(page, '16-menu-sous-menu')
  await page.keyboard.press('Escape')
  // Une modification non enregistrée, puis « Nouveau » : la fenêtre de question.
  await page.evaluate(() => {
    type Store = { getState(): { doc: { pages: { id: string }[] }; dispatch(ops: unknown[], label: string): unknown } }
    const store = (window as unknown as { __maquetteStore: Store }).__maquetteStore
    store.getState().dispatch([{ op: 'create', parent: store.getState().doc.pages[0]!.id, node: { type: 'shape', shape: 'rectangle', name: 'r', x: 10, y: 10, width: 50, height: 50 } }], 'capture')
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())!.webContents.send('menu', 'new'))
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(200)
  await shot(page, '17-dialogue')
  await app.close()
})

test('chat avec Claude', async () => {
  const { app, page } = await open([scene])
  await fakeChat(app, [])
  await reopen(page)
  await page.keyboard.press('Control+l')
  await page.waitForTimeout(300)
  await shot(page, '12-chat-vide')

  await fakeChat(app, [
    { kind: 'user', id: 'u1', text: 'Ajoute une section tarifs à 3 colonnes sous le hero', images: 1 },
    { kind: 'assistant', id: 'a1', text: 'Je pose **trois colonnes** dans un cadre automatique :\n\n1. Essentiel, 19 € par mois\n2. Pro, 49 € par mois\n3. Studio, sur devis\n\nLe prix utilise le style `Titre 2`, voir https://exemple.be/tarifs.' },
    { kind: 'tool', id: 't1', name: 'lire_document', summary: 'page Scène', status: 'done' },
    { kind: 'tool', id: 't2', name: 'appliquer', summary: '24 éléments créés dans « Tarifs », colonnes de 320 px', status: 'done' },
    { kind: 'tool', id: 't3', name: 'verifier_gout', summary: 'cadre Tarifs', status: 'error' },
    { kind: 'error', id: 'e1', text: 'Le contrôle a échoué : cadre masqué.' },
    { kind: 'user', id: 'u2', text: 'Lance le build pour voir', images: 0 },
    { kind: 'tool', id: 't4', name: 'Read', summary: 'package.json', status: 'done' },
  ])
  await reopen(page, 'C:/essais/tarifs.maquette')
  await emit(app, { type: 'busy', busy: true })
  await emit(app, { type: 'item', item: { kind: 'tool', id: 't5', name: 'Bash', summary: 'npm run build', status: 'running' } })
  await emit(app, { type: 'item', item: { kind: 'permission', id: 'p1', requestId: 'r1', tool: 'Bash', summary: 'npm run build && npx electron-builder --win --publish never', status: 'asking' } })
  await page.waitForTimeout(300)
  await shot(page, '13-chat-conversation')

  await emit(app, { type: 'item', item: { kind: 'permission', id: 'p1', requestId: 'r1', tool: 'Bash', summary: 'npm run build && npx electron-builder --win --publish never', status: 'allowed' } })
  await emit(app, { type: 'delta', id: 'a2', text: 'Le build passe. Je regarde maintenant les **marges** de la colonne du milieu' })
  await select(page, ['fHero1'])
  await page.evaluate(() => {
    const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEXgH+mvh0WAAAAABJRU5ErkJggg=='
    const store = (window as unknown as { __chatStore?: { getState(): { addImage(i: { mediaType: string; data: string }): boolean } } }).__chatStore
    store?.getState().addImage({ mediaType: 'image/png', data: px })
  })
  await page.getByRole('textbox', { name: 'Message à Claude' }).fill('Et réduis l’espace entre les colonnes à 24 px,\npuis aligne les boutons en bas')
  await page.waitForTimeout(300)
  await shot(page, '14-chat-saisie')
  await app.close()
})

test('chat : outils dépliés et images', async () => {
  // Faux claude : vraies vignettes enregistrées et servies par l'app.
  const setup = engineSetup()
  const { app, page } = await open([setup.file], setup.env)
  await page.keyboard.press('Control+l')
  const panel = page.getByTestId('chat-panel')
  await expect(panel).toBeVisible()
  const box = page.getByRole('textbox', { name: 'Message à Claude' })
  const say = async (text: string, reply: string) => {
    await box.fill(text)
    await box.press('Enter')
    await expect(panel.locator('.chat-assistant').last()).toHaveText(reply)
  }

  // Deux images jointes : une « capture » en dégradé et un aplat.
  const images = await app.evaluate(({ nativeImage }) => {
    const make = (w: number, h: number, color: (x: number, y: number) => number[]) => {
      const px = Buffer.alloc(w * h * 4)
      // Bitmap en BGRA.
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [r, g, b, a] = color(x, y)
        px.set([b!, g!, r!, a!], (y * w + x) * 4)
      }
      return nativeImage.createFromBitmap(px, { width: w, height: h }).toPNG().toString('base64')
    }
    return [
      make(320, 200, (x, y) => (y < 40 ? [40, 40, 40, 255] : [255 - Math.round((x / 320) * 200), 120 + Math.round((y / 200) * 80), 40 + Math.round((x / 320) * 200), 255])),
      make(200, 200, (x, y) => ((x >> 5) + (y >> 5)) % 2 ? [242, 72, 34, 255] : [255, 205, 41, 255]),
    ]
  })
  await page.evaluate((list) => {
    const store = (window as unknown as { __chatStore: { getState(): { addImage(i: { mediaType: string; data: string }): boolean } } }).__chatStore
    for (const data of list) store.getState().addImage({ mediaType: 'image/png', data })
  }, images)
  await say('Voici deux images de référence pour le hero', '2 image(s) reçue(s)')
  await say('Bonjour, regarde le hero', 'Bonjour !')
  await say('regarde le hero', 'Le hero est bien centré.')
  await box.fill('lance une commande')
  await box.press('Enter')
  await panel.getByRole('button', { name: 'Autoriser' }).click()
  await expect(panel.locator('.chat-assistant').last()).toHaveText('autorisé')
  await say('dessine un rectangle', 'Fait.')
  await page.waitForTimeout(300)
  await shot(page, '18-chat-outils-replies')

  await panel.getByRole('button', { name: /Regarde le rendu/ }).click()
  await panel.getByRole('button', { name: /Lance une commande/ }).click()
  await page.waitForTimeout(200)
  await shot(page, '19-chat-outils-deplies')

  await panel.getByRole('button', { name: /Modifie la maquette/ }).click()
  await panel.getByRole('button', { name: /Regarde le rendu/ }).click()
  await panel.getByRole('button', { name: /Lance une commande/ }).click()
  await page.waitForTimeout(200)
  await shot(page, '20-chat-appliquer-deplie')

  await panel.locator('.chat-log').evaluate((el) => (el.scrollTop = 0))
  await page.waitForTimeout(200)
  await shot(page, '21-chat-images-jointes')

  await panel.getByRole('button', { name: 'Agrandir l’image jointe 1' }).click()
  await page.waitForTimeout(300)
  await shot(page, '22-chat-apercu')
  await app.close()
})
