import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { launch } from './launch'

/** PNG d'une seule couleur, fait à la main (aucune dépendance). */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(width * 3 + 1)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Faux Openverse + faux Commons + fichiers, sur 127.0.0.1 : aucun appel réel pendant les tests. */
async function fakeSources(): Promise<{ base: string; server: Server; hits: string[] }> {
  const hits: string[] = []
  const photo = png(2600, 1000, [176, 112, 64])
  const thumb = png(300, 200, [120, 80, 40])
  let base = ''
  const record = (id: string, licence: string) => ({
    id, title: `Fresh bread ${id}`, creator: 'Jane Baker', license: licence, license_version: '2.0',
    url: `${base}/files/${id}.png`, thumbnail: `${base}/thumbs/${id}.png`, width: 2600, height: 1000, source: 'flickr',
    foreign_landing_url: `https://example.org/${id}`,
  })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', base)
    hits.push(url.pathname)
    const send = (type: string, body: Buffer | string) => {
      res.writeHead(200, { 'content-type': type })
      res.end(body)
    }
    if (url.pathname === '/v1/images/') {
      return send('application/json', JSON.stringify({ result_count: 3, results: [record('ov-1', 'by'), record('ov-nc', 'by-nc'), record('ov-3', 'cc0')] }))
    }
    const one = /^\/v1\/images\/([^/]+)\/$/.exec(url.pathname)
    if (one) return send('application/json', JSON.stringify(record(one[1]!, one[1] === 'ov-nc' ? 'by-nc' : 'by')))
    if (url.pathname === '/w/api.php') {
      return send('application/json', JSON.stringify({
        query: { pages: [{
          pageid: 77, index: 1, title: 'File:Wood oven.png',
          imageinfo: [{
            url: `${base}/files/oven.png`, thumburl: `${base}/thumbs/oven.png`, width: 2600, height: 1000, mime: 'image/png',
            descriptionurl: 'https://commons.example/File:Wood_oven.png',
            extmetadata: { ObjectName: { value: 'Wood oven' }, Artist: { value: 'Jan' }, License: { value: 'cc0' }, LicenseShortName: { value: 'CC0' } },
          }],
        }] },
      }))
    }
    if (url.pathname.startsWith('/files/')) return send('image/png', photo)
    if (url.pathname.startsWith('/thumbs/')) return send('image/png', thumb)
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { base, server, hits }
}

test('images : chercher (planche), poser dans un rectangle, créditer, annuler en un Ctrl+Z', async () => {
  test.setTimeout(60_000)
  const fake = await fakeSources()
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\maquette-e2e-img-${process.pid}` : join(tmpdir(), `maquette-e2e-img-${process.pid}.sock`)
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-img-')), MAQUETTE_IMAGES_API: fake.base }

  const dir = mkdtempSync(join(tmpdir(), 'photos é '))
  const file = join(dir, 'boulangerie.maquette')
  const placeholder = {
    id: 'rPhoto', type: 'shape', shape: 'rectangle', name: 'Photo', visible: true, locked: false, opacity: 1,
    width: 480, height: 320, x: 40, y: 40, position: 'flow', fills: ['#D9D9D9'], radius: 12, shadows: [],
  }
  await writeFile(file, JSON.stringify({ format: 'maquette', version: 1, styles: { colors: [], text: [] }, pages: [{ id: 'pAccueil', name: 'Accueil', children: [placeholder] }] }), 'utf8')

  const { app, page } = await launch([file], env)
  const exe = await app.evaluate(() => process.execPath)
  await expect(page.locator('.canvas [data-node-id="rPhoto"]')).toBeVisible()
  const transport = new StdioClientTransport({
    command: exe,
    args: [resolve('out/main/relay.js')],
    env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' },
  })
  const c = new Client({ name: 'e2e', version: '1.0.0' })
  await c.connect(transport)
  type Content = { type: string; text?: string; data?: string; mimeType?: string }[]
  const call = async (args: object) => {
    const r = await c.callTool({ name: 'images', arguments: args as Record<string, unknown> })
    const content = r.content as Content
    return { r, text: content.find((x) => x.type === 'text')?.text ?? '', image: content.find((x) => x.type === 'image') }
  }
  try {
    // Chercher : licence non commerciale écartée, planche-contact JPEG des vignettes.
    const found = await call({ cherche: 'bakery bread', n: 3 })
    expect(found.r.isError, found.text).toBeFalsy()
    const results = JSON.parse(found.text).resultats as unknown[][]
    expect(results.map((x) => x[1])).toEqual(['openverse:ov-1', 'commons:77', 'openverse:ov-3'])
    expect(results[0]!.slice(3, 6)).toEqual(['Jane Baker', 'CC BY 2.0', '2600x1000'])
    expect(found.image?.mimeType).toBe('image/jpeg')
    expect(found.image?.data?.length).toBeGreaterThan(1000)

    // Poser le n°1 dans le rectangle : téléchargé, réduit à 2400 px, enregistré dans assets/, crédité.
    const placed = await call({ poser: 1, dans: 'rPhoto' })
    expect(placed.r.isError, placed.text).toBeFalsy()
    const out = JSON.parse(placed.text)
    expect(out).toMatchObject({ ok: true, taille: '2400x923', credit: '« Fresh bread ov-1 » par Jane Baker, CC BY 2.0, via Flickr' })
    const img = page.locator(`img[data-node-id="${out.id}"]`)
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2400)
    await expect(page.locator('.canvas [data-node-id="rPhoto"]')).toHaveCount(0)
    const files = await readdir(join(dir, 'assets'))
    expect(files.sort()).toEqual(['credits.json', out.src.slice('assets/'.length)])
    const credits = JSON.parse(await readFile(join(dir, 'assets', 'credits.json'), 'utf8'))
    expect(credits).toMatchObject([{ file: out.src, ref: 'openverse:ov-1', licenseCode: 'by', page: 'https://example.org/ov-1', width: 2400 }])

    const listed = await call({ credits: true })
    expect(JSON.parse(listed.text).credits).toEqual([[out.src, out.credit, 'https://example.org/ov-1']])

    // Une seule annulation : le rectangle revient, la photo s'en va.
    await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+z')
    await expect(img).toHaveCount(0)
    await expect(page.locator('.canvas [data-node-id="rPhoto"]')).toBeVisible()

    // Réseau coupé : erreur claire, document intact.
    fake.server.close()
    fake.server.closeAllConnections()
    const offline = await call({ cherche: 'bakery' })
    expect(offline.r.isError).toBe(true)
    expect(offline.text).toContain('pas de réseau')
  } finally {
    await c.close()
    await app.close()
    fake.server.close()
  }
})

test('images : document jamais enregistré, message clair et rien de posé', async () => {
  const fake = await fakeSources()
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\maquette-e2e-img2-${process.pid}` : join(tmpdir(), `maquette-e2e-img2-${process.pid}.sock`)
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: mkdtempSync(join(tmpdir(), 'maquette-img-')), MAQUETTE_IMAGES_API: fake.base }
  const { app } = await launch([], env)
  const exe = await app.evaluate(() => process.execPath)
  const transport = new StdioClientTransport({ command: exe, args: [resolve('out/main/relay.js')], env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' } })
  const c = new Client({ name: 'e2e', version: '1.0.0' })
  await c.connect(transport)
  try {
    const r = await c.callTool({ name: 'images', arguments: { poser: 'openverse:ov-1' } })
    expect(r.isError).toBe(true)
    expect((r.content as { text: string }[])[0]!.text).toContain('jamais enregistré')
    expect(fake.hits.filter((h) => h.startsWith('/files/'))).toEqual([])
  } finally {
    await c.close()
    await app.close()
    fake.server.close()
  }
})
