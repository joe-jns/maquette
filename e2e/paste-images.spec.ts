import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canUndo, pageChildren, uiState } from './canvas'
import { FAKE_CLAUDE } from './chat'
import { launch } from './launch'

/**
 * Images de référence : coller (presse-papiers SIMULÉ dans le principal — celui de l'utilisateur
 * n'est jamais touché), glisser depuis une page web, document sans titre, capture de plusieurs
 * éléments, contexte du chat.
 */

type Child = { id: string; type: string; name: string; src?: string; x: number; y: number; width: number; height: number }
const children = async (page: Page) => (await pageChildren(page)) as unknown as Child[]
const images = async (page: Page) => (await children(page)).filter((c) => c.type === 'image')

/** PNG uni de la taille demandée, fabriqué par le principal ; base64. */
const png = (app: ElectronApplication, width: number, height: number, shade: number) =>
  app.evaluate(({ nativeImage }, [w, h, s]) => nativeImage.createFromBitmap(Buffer.alloc(w! * h! * 4, s!), { width: w!, height: h! }).toPNG().toString('base64'), [width, height, shade])

/** Remplit le presse-papiers simulé (MAQUETTE_E2E) : texte, HTML, image. */
const setClipboard = (app: ElectronApplication, content: { text?: string; html?: string; png?: string }) =>
  app.evaluate((_e, c) => void ((globalThis as unknown as { __maquetteFakeClipboard: unknown }).__maquetteFakeClipboard = c), content)

/** Remplace la boîte « Enregistrer sous » : elle répond `target` et compte ses appels. */
const stubSaveDialog = (app: ElectronApplication, target: string) =>
  app.evaluate(({ dialog }, target) => {
    const g = globalThis as unknown as { __saveDialogs: number }
    g.__saveDialogs = 0
    dialog.showSaveDialog = (async () => {
      g.__saveDialogs++
      return { canceled: false, filePath: target }
    }) as typeof dialog.showSaveDialog
  }, target)
const saveDialogs = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { __saveDialogs: number }).__saveDialogs)

const sendMenu = (app: ElectronApplication, cmd: string) =>
  app.evaluate(({ BrowserWindow }, cmd) => {
    const editor = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('export=1'))
    editor!.webContents.send('menu', cmd)
  }, cmd)

/** Pointeur sur le canevas (point écran à `dx`, `dy` du coin haut-gauche), puis Ctrl+V. */
async function pasteAt(page: Page, dx = 300, dy = 200): Promise<void> {
  const box = (await page.getByTestId('canvas').boundingBox())!
  await page.mouse.move(box.x + dx, box.y + dy)
  await page.keyboard.press('Control+v')
}

/** Serveur d'images local : /a.png, /b.png… ; /page renvoie du HTML (pas une image). */
async function imageServer(files: Record<string, Buffer>): Promise<{ base: string; server: Server; hits: string[] }> {
  const hits: string[] = []
  const server = createServer((req, res) => {
    hits.push(req.url ?? '')
    const name = (req.url ?? '').slice(1)
    const file = files[name]
    if (file) {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': file.length })
      res.end(file)
    } else {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html></html>')
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, hits }
}

test('coller une capture : image au pointeur, 800 px de large au plus, une seule annulation, sans boîte d’enregistrement', async () => {
  const { app, page } = await launch()
  try {
    await stubSaveDialog(app, join(mkdtempSync(join(tmpdir(), 'maquette-paste-')), 'jamais.maquette'))
    await setClipboard(app, { png: await png(app, 1600, 1000, 0x50) })
    await pasteAt(page)
    await expect.poll(async () => (await images(page)).length).toBe(1)
    const [img] = await images(page)
    expect(img).toMatchObject({ name: 'Pasted image', width: 800, height: 500 })
    expect(img!.src).toMatch(/^assets\/[0-9a-f]{16}\.png$/)
    expect((await uiState(page)).selection).toEqual([img!.id])
    await expect.poll(() => page.locator(`img[data-node-id="${img!.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1600)
    expect(await saveDialogs(app)).toBe(0)

    await page.keyboard.press('Control+z')
    expect(await images(page)).toEqual([])
    expect(await canUndo(page)).toBe(false)

    // Des éléments Maquette copiés passent avant l'image restée dans le presse-papiers.
    const copiedNode = await page.evaluate(() => {
      const store = (window as unknown as { __maquetteStore: { getState(): { pageId: string; doc: { pages: { children: unknown[] }[] }; dispatch(ops: unknown[], label: string): unknown; undo(): void } } }).__maquetteStore
      store.getState().dispatch([{ op: 'create', parent: store.getState().pageId, node: { type: 'shape', shape: 'rectangle', name: 'Copié', x: 0, y: 0, width: 50, height: 50 } }], 'test')
      const node = store.getState().doc.pages[0]!.children[0]
      store.getState().undo()
      return node
    })
    const payload = JSON.stringify({ format: 'maquette-clipboard', version: 1, nodes: [copiedNode], colors: [], text: [] })
    await setClipboard(app, { png: await png(app, 100, 100, 0x10), text: payload })
    await pasteAt(page)
    await expect.poll(async () => (await children(page)).map((c) => `${c.type} ${c.name}`)).toEqual(['shape Copié'])
  } finally {
    await app.close()
  }
})

test('coller du HTML avec deux images, et glisser une image depuis une page : téléchargées, en grille, une annulation', async () => {
  const { app, page } = await launch()
  const web = await imageServer({
    'a.png': Buffer.from(await png(app, 1200, 600, 0x20), 'base64'),
    'b.png': Buffer.from(await png(app, 600, 900, 0x90), 'base64'),
  })
  try {
    // Collage d'un fragment HTML (sélection d'une page) : les deux images, côte à côte.
    await setClipboard(app, { html: `<p>Inspiration</p><img src="${web.base}/a.png"><img alt="" src='${web.base}/b.png'>` })
    await pasteAt(page, 200, 150)
    await expect.poll(async () => (await images(page)).length).toBe(2)
    const [a, b] = await images(page)
    expect(a).toMatchObject({ name: 'a', width: 800, height: 400 })
    expect(b).toMatchObject({ name: 'b', width: 600, height: 900 })
    expect(b!.x).toBe(a!.x + 800 + 40)
    expect(b!.y).toBe(a!.y)
    expect((await uiState(page)).selection).toHaveLength(2)
    await page.keyboard.press('Control+z')
    expect(await images(page)).toEqual([])

    // Glisser une image depuis un navigateur : pas de fichier, du HTML (lien autour de l'image) et une uri-list.
    const box = (await page.getByTestId('canvas').boundingBox())!
    const at = { x: box.x + 400, y: box.y + 300 }
    await page.evaluate(({ at, html }) => {
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      dt.setData('text/uri-list', 'https://dribbble.com/shots/1')
      const target = document.elementFromPoint(at.x, at.y)!
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: dt }))
      }
    }, { at, html: `<a href="https://dribbble.com/shots/1"><img src="${web.base}/b.png"></a>` })
    await expect.poll(async () => (await images(page)).length).toBe(1)
    const [dropped] = await images(page)
    expect(dropped).toMatchObject({ name: 'b', width: 600, height: 900 })
    await expect.poll(() => page.locator(`img[data-node-id="${dropped!.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(600)

    // Une adresse d'image qui sert en fait du HTML : message, rien de posé.
    await setClipboard(app, { text: `${web.base}/c.png` })
    await pasteAt(page)
    await expect(page.getByRole('alert')).toContainText('pas une image')
    expect(await images(page)).toHaveLength(1)
  } finally {
    await app.close()
    web.server.close()
  }
})

test('document sans titre : 3 images collées sans boîte, puis Enregistrer sous → assets/ recopié, document rouvert intact', async () => {
  const { app, page } = await launch()
  const dir = mkdtempSync(join(tmpdir(), 'maquette-sans-titre-'))
  const target = join(dir, 'références.maquette')
  try {
    await stubSaveDialog(app, target)
    for (const [i, shade] of [0x30, 0x60, 0x90].entries()) {
      await setClipboard(app, { png: await png(app, 400, 300, shade) })
      await pasteAt(page, 150 + i * 30, 150)
      await expect.poll(async () => (await images(page)).length).toBe(i + 1)
    }
    expect(await saveDialogs(app)).toBe(0)
    const srcs = (await images(page)).map((c) => c.src!)
    expect(new Set(srcs).size).toBe(3)

    await sendMenu(app, 'save-as')
    await expect.poll(() => existsSync(target)).toBe(true)
    expect(await saveDialogs(app)).toBe(1)
    const saved = JSON.parse(readFileSync(target, 'utf8'))
    const savedSrcs = (saved.pages[0].children as Child[]).filter((c) => c.type === 'image').map((c) => c.src)
    expect(savedSrcs).toEqual(srcs)
    expect(readdirSync(join(dir, 'assets')).sort()).toEqual(srcs.map((s) => s.replace('assets/', '')).sort())
    // Toujours affichées, et l'annulation reste possible.
    for (const c of await images(page)) {
      await expect.poll(() => page.locator(`img[data-node-id="${c.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(400)
    }
    expect(await canUndo(page)).toBe(true)
  } finally {
    await app.close()
  }

  const again = await launch([target])
  try {
    await expect.poll(async () => (await images(again.page)).length).toBe(3)
    const list = await images(again.page)
    for (const c of list) {
      await expect.poll(() => again.page.locator(`img[data-node-id="${c.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(400)
    }
  } finally {
    await again.app.close()
  }
})

test('sans titre, l’app plante : la copie restaurée retrouve ses images, qui suivent au premier enregistrement', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'maquette-crash-img-'))
  const first = await launch([], { MAQUETTE_USER_DATA: userData })
  await setClipboard(first.app, { png: await png(first.app, 300, 200, 0x70) })
  await pasteAt(first.page)
  await expect.poll(async () => (await images(first.page)).length).toBe(1)
  const src = (await images(first.page))[0]!.src!
  await first.page.waitForTimeout(6000)
  const dead = new Promise((r) => first.app.process().once('exit', r))
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(first.app.process().pid), '/T', '/F'], { stdio: 'ignore' })
  else first.app.process().kill('SIGKILL')
  await dead
  await new Promise((r) => setTimeout(r, 500))

  const second = await launch([], { MAQUETTE_USER_DATA: userData })
  const dir = mkdtempSync(join(tmpdir(), 'maquette-crash-doc-'))
  try {
    const banner = second.page.getByTestId('recovery')
    await banner.getByRole('button', { name: 'Restore' }).click()
    await expect(banner).toHaveCount(0)
    const [img] = await images(second.page)
    expect(img!.src).toBe(src)
    await expect.poll(() => second.page.locator(`img[data-node-id="${img!.id}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(300)
    await stubSaveDialog(second.app, join(dir, 'récupéré.maquette'))
    await sendMenu(second.app, 'save-as')
    await expect.poll(() => existsSync(join(dir, src))).toBe(true)
  } finally {
    await second.app.close()
  }
})

test('capture de plusieurs éléments en un appel (relais MCP) : une image légendée par élément', async () => {
  const pipe = `\\\\.\\pipe\\maquette-e2e-capture-${process.pid}`
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-capture-')) }
  const { app, page } = await launch([], env)
  const exe = await app.evaluate(() => process.execPath)
  const transport = new StdioClientTransport({ command: exe, args: [resolve('out/main/relay.js')], env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' } })
  const c = new Client({ name: 'e2e', version: '1.0.0' })
  await c.connect(transport)
  try {
    await setClipboard(app, { png: await png(app, 1440, 900, 0x40) })
    await pasteAt(page)
    await expect.poll(async () => (await images(page)).length).toBe(1)
    const pageId = await page.evaluate(() => (window as unknown as { __maquetteStore: { getState(): { pageId: string } } }).__maquetteStore.getState().pageId)
    const r = await c.callTool({ name: 'appliquer', arguments: { operations: [{ op: 'create', parent: pageId, node: { id: '$r', type: 'shape', shape: 'rectangle', name: 'Carré', x: 2000, y: 0, width: 200, height: 200, fills: ['#C2410C'] } }] } })
    const rectId = JSON.parse((r.content as { text: string }[])[0]!.text).ids.$r as string
    const imgId = (await images(page))[0]!.id

    const cap = await c.callTool({ name: 'capture', arguments: { ids: [imgId, rectId, 'absent'] } })
    expect(cap.isError).toBeFalsy()
    const content = cap.content as { type: string; text?: string; data?: string; mimeType?: string }[]
    expect(content.map((x) => x.type)).toEqual(['text', 'text', 'image', 'text', 'image'])
    expect(content[0]!.text).toBe('2 captures ; échec : absent (introuvable)')
    expect(content[1]!.text).toBe(`${imgId} « Pasted image » 800×500`)
    expect(content[3]!.text).toBe(`${rectId} « Carré » 200×200`)
    // Image : 1024 px de large par défaut (le rendu est à l'échelle 1, l'image fait 800 px : on lit sa taille réelle).
    const sizeOf = (b64: string) => app.evaluate(({ nativeImage }, d) => nativeImage.createFromBuffer(Buffer.from(d, 'base64')).getSize(), b64)
    expect((await sizeOf(content[2]!.data!)).width).toBeGreaterThanOrEqual(800)
    expect(content[2]!.mimeType).toBe('image/jpeg')

    // Compatibilité : capture({ id }) rend toujours une seule image.
    const one = await c.callTool({ name: 'capture', arguments: { id: rectId } })
    expect((one.content as { type: string }[]).map((x) => x.type)).toEqual(['text', 'image'])
  } finally {
    await c.close()
    await app.close()
  }
})

test('chat : les images sélectionnées partent comme références (pastille « 2 images », contexte reçu par claude)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'maquette-chat-img-'))
  const log = join(dir, 'fake-claude.log')
  const env = {
    MAQUETTE_CLAUDE_CMD: FAKE_CLAUDE, FAKE_CLAUDE_LOG: log, MAQUETTE_USER_DATA: join(dir, 'data'),
    MAQUETTE_PIPE: `\\\\.\\pipe\\maquette-chat-img-${process.pid}-${Date.now()}`,
  }
  const { app, page } = await launch([], env)
  try {
    for (const [i, shade] of [0x20, 0xa0].entries()) {
      await setClipboard(app, { png: await png(app, 1440, 900, shade) })
      await pasteAt(page, 150 + i * 40, 150)
      await expect.poll(async () => (await images(page)).length).toBe(i + 1)
    }
    const ids = (await images(page)).map((c) => c.id)
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+l')
    const panel = page.getByTestId('chat-panel')
    await expect(panel.getByTestId('chat-selection')).toContainText('2 images')
    await panel.getByRole('textbox', { name: 'Message to Claude' }).fill('Fais une page d’accueil cohérente avec ces références')
    await page.keyboard.press('Enter')
    const expected = `2 images de référence sélectionnées : ${ids[0]} (Pasted image, 1440×900), ${ids[1]} (Pasted image, 1440×900) — regarde-les avec capture({ ids: [\\"${ids[0]}\\", \\"${ids[1]}\\"] }).`
    await expect.poll(() => (existsSync(log) ? readFileSync(log, 'utf8') : ''), { timeout: 15_000 }).toContain(expected)
  } finally {
    await app.close()
  }
})
