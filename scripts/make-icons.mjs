// Rend build/icon.svg en build/icon.png (512) et build/icon.ico (16 à 256 px), avec Electron hors écran.
// Lancer : npx electron scripts/make-icons.mjs
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Fichier ICO dont chaque image est un PNG (accepté par Windows depuis Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const e = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, e)
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1)
    dir.writeUInt16LE(1, e + 4)
    dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(data.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`)}`)
  await new Promise((r) => setTimeout(r, 500))
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(root, 'build', 'icon.png'), full.resize({ width: 512, height: 512, quality: 'best' }).toPNG())
  const pngs = SIZES.map((size) => ({ size, data: full.resize({ width: size, height: size, quality: 'best' }).toPNG() }))
  writeFileSync(join(root, 'build', 'icon.ico'), ico(pngs))
  console.log('build/icon.png et build/icon.ico écrits')
  app.quit()
})
