import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { emit, engineSetup, fakeChat, reopen } from '../e2e/chat'

/**
 * Captures de tous les états de l'interface, pour relire le design (phase polish).
 * npx electron-vite build && SHOTS=<dossier> npx playwright test -c e2e-shots
 */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const scene = resolve('e2e/fixtures/scene.maquette')

async function open(args: string[] = [], opts: { userData?: string; home?: boolean; env?: Record<string, string> } = {}) {
  const app = await electron.launch({
    args: ['.', ...args],
    env: { ...process.env, MAQUETTE_E2E: '1', MAQUETTE_USER_DATA: opts.userData ?? mkdtempSync(join(tmpdir(), 'maquette-shots-')), ...opts.env },
  })
  const page = await app.firstWindow()
  // La fenêtre de l'éditeur (pas celle, cachée, du rendu des aperçus et exports).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.setContentSize(1440, 900))
  if (opts.home) {
    await expect(page.getByTestId('home')).toBeVisible()
    await page.waitForTimeout(600)
    return { app, page }
  }
  // Sans fichier : l'accueil, puis « Nouvelle maquette ».
  if (!args.length) await page.getByTestId('home').getByRole('button', { name: 'Nouvelle maquette' }).first().click()
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.webContents.send('menu', 'new'))
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
  const { app, page } = await open([setup.file], { env: setup.env })
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

/** Une page de site plausible (1440 × 900) : barre, titre, texte, bouton, visuel. */
function siteDoc(accent: string, title: string, width = 1440, height = 900): string {
  const base = { visible: true, locked: false, opacity: 1, position: 'flow' }
  const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, radius = 0) =>
    ({ ...base, id, type: 'shape', shape: 'rectangle', name: id, x, y, width: w, height: h, fills: [fill], radius, shadows: [] })
  const text = (id: string, x: number, y: number, w: number, content: string, size: number, weight: number, color: string) =>
    ({ ...base, id, type: 'text', name: id, x, y, width: w, height: { mode: 'hug' }, content, fontFamily: 'Inter', fontWeight: weight, fontStyle: 'normal', fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: 0, textAlign: 'left', color, textSizing: 'auto-height' })
  const mobile = width < 600
  const pad = mobile ? 24 : 96
  const children = [
    rect('bar', 0, 0, width, 72, '#FFFFFF'),
    text('logo', pad, 24, 200, title, 18, 700, '#111111'),
    text('h1', pad, mobile ? 140 : 220, mobile ? width - 48 : 620, 'Des sites qui donnent envie de pousser la porte', mobile ? 34 : 56, 700, '#111111'),
    text('p', pad, mobile ? 330 : 440, mobile ? width - 48 : 520, 'Conception, rédaction et mise en ligne en trois semaines, pour les commerces de la région.', mobile ? 16 : 18, 400, '#444444'),
    rect('cta', pad, mobile ? 430 : 540, 180, 52, accent, 8),
    rect('visuel', mobile ? 24 : 820, mobile ? 520 : 160, mobile ? width - 48 : 524, mobile ? 260 : 600, accent, 16),
  ]
  const frame = { ...base, id: 'fPage', type: 'frame', name: 'Accueil', x: 0, y: 0, width, height, layout: { mode: 'free' }, fills: ['#F4F1EA'], radius: 0, shadows: [], clip: true, children }
  return JSON.stringify({ format: 'maquette', version: 1, styles: { colors: [], text: [] }, pages: [{ id: 'p1', name: 'Page 1', children: [frame] }] })
}

test('accueil', async () => {
  test.setTimeout(120_000)
  const empty = await open([], { home: true })
  await shot(empty.page, '21-accueil-vide')
  await empty.app.close()

  // Quatre fichiers aux aperçus faits par l'app (ouverts une fois chacun), plus un introuvable.
  const userData = mkdtempSync(join(tmpdir(), 'maquette-shots-home-'))
  const dir = mkdtempSync(join(tmpdir(), 'maquette-shots-files-'))
  const files = [
    ['Boulangerie Delvaux', siteDoc('#B45309', 'Delvaux')],
    ['Studio Été — refonte', siteDoc('#1D4ED8', 'Studio Été')],
    ['Garage Lambert mobile', siteDoc('#15803D', 'Lambert', 390, 844)],
    ['Fleuriste', siteDoc('#BE185D', 'Fleurs & Co')],
  ] as const
  const paths: string[] = []
  for (const [name, text] of files) {
    const path = join(dir, `${name}.maquette`)
    await writeFile(path, text, 'utf8')
    paths.push(path)
  }
  for (const path of paths) {
    const run = await open([path], { userData })
    const before = (await readdir(join(userData, 'thumbs')).catch(() => [])).length
    await expect.poll(async () => (await readdir(join(userData, 'thumbs')).catch(() => [])).length, { timeout: 20_000 }).toBe(before + 1)
    await run.app.close()
  }
  const now = Date.now() / 1000
  const ages = [20 * 60, 3 * 3600, 26 * 3600, 9 * 86400]
  await Promise.all(paths.map((p, i) => utimes(p, now - ages[i]!, now - ages[i]!)))
  await writeFile(join(userData, 'recent.json'), JSON.stringify([...paths, join(dir, 'Ancien projet.maquette')]), 'utf8')

  const { app, page } = await open([], { userData, home: true })
  await page.waitForTimeout(400)
  await shot(page, '22-accueil')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  await shot(page, '23-accueil-clavier')
  await page.getByTestId('home-card').nth(1).hover()
  await page.getByTestId('home-card').nth(1).locator('.home-card-more').click()
  await page.waitForTimeout(200)
  await shot(page, '24-accueil-menu')
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox').fill('studio')
  await page.waitForTimeout(200)
  await shot(page, '25-accueil-recherche')
  await app.close()
})
