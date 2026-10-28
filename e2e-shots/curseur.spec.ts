import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { emit } from '../e2e/chat'
import { launch } from '../e2e/launch'

/** Captures du curseur de Claude : il glisse vers ce qu'il crée, puis « pense » entre deux outils. */
const out = process.env.SHOTS ?? join(tmpdir(), 'maquette-shots')
const pipe = `\\\\.\\pipe\\maquette-shots-${process.pid}`

test('curseur de Claude', async () => {
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-shots-')) }
  const { app, page } = await launch([], env)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.isOffscreen())!.setContentSize(1440, 900))
  await expect(page.getByTestId('canvas')).toBeVisible()
  const exe = await app.evaluate(() => process.execPath)
  const c = new Client({ name: 'shots', version: '1.0.0' })
  await c.connect(new StdioClientTransport({ command: exe, args: [resolve('out/main/relay.js')], env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' } }))
  const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { text?: string }[])[0]?.text ?? ''
  let raw = ''
  await expect.poll(async () => (raw = text(await c.callTool({ name: 'lire_document', arguments: {} }))).slice(0, 160), { timeout: 15000 }).toMatch(/^{/)
  const pageId = JSON.parse(raw).pages[0].id as string
  const make = (name: string, x: number, y: number, w: number, h: number, fill: string) =>
    c.callTool({ name: 'appliquer', arguments: { libelle: name, operations: [{ op: 'create', parent: pageId, node: { type: 'shape', shape: 'rectangle', name, x, y, width: w, height: h, fills: [fill] } }] } })
  await emit(app, { type: 'busy', busy: true } as never)
  await make('Hero', 0, 0, 640, 320, '#1E1A16')
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(out, 'curseur-1.png') })
  await make('Bouton', 40, 360, 200, 56, '#2F6B4F')
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(out, 'curseur-2-glisse.png') })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: join(out, 'curseur-3-pense.png') })
  // Une section entière en un appel : elle apparaît pièce par pièce, le curseur passant de l'une à l'autre.
  const txt = (content: string, size: number) => ({ type: 'text', content, fontSize: size, fills: ['#F6F1E8'] })
  const res = await c.callTool({ name: 'appliquer', arguments: { libelle: 'hero', operations: [{ op: 'create', parent: pageId, node: {
    type: 'frame', name: 'Hero 2', x: 0, y: 480, width: 900, height: 360, fills: ['#1E1A16'], layout: { mode: 'auto', direction: 'column', gap: 16, padding: [48, 48, 48, 48] },
    children: [
      { type: 'frame', name: 'Nav', layout: { mode: 'auto', direction: 'row', gap: 24 }, children: [txt('Mezzaluna', 18), txt('Menu', 16), txt('Book', 16)] },
      txt('Fresh pasta in Liège', 64), txt('Tuesday to Saturday, book online.', 20),
    ] } }] } })
  for (const [i, ms] of [[1, 150], [2, 500], [3, 600]] as const) {
    await page.waitForTimeout(ms)
    await page.screenshot({ path: join(out, `apparition-${i}.png`) })
  }
  await c.close()
  await app.close()
})
