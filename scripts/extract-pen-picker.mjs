#!/usr/bin/env node
// Extrait la liste du sélecteur « Choose a style » du chat de Pen et ses vignettes (web + mobile),
// réduites, vers vendor/design/thumbs/ (picker.json + .webp). Usage personnel ; Pen n'est que lu.
//
//   node scripts/extract-pen-picker.mjs <chemin de out/editor de Pen>
//
// Dans le bundle de Pen : `const wye=[…]` (une entrée par variante, avec vignettes), puis le sélecteur
// garde les entrées à partir de « Centered Serif List », une par style (`egr`). ffmpeg (libwebp) réduit
// chaque vignette au haut de la page, à la taille d'affichage ×2.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'vendor', 'design', 'thumbs')
const editor = process.argv[2]
if (!editor) {
  console.error('usage : node scripts/extract-pen-picker.mjs <dossier out/editor de Pen>')
  process.exit(1)
}
const code = readFileSync(join(editor, 'assets', 'index.js'), 'utf8')

/** Tableau littéral qui commence à `start` (chaînes sautées). */
function literal(start) {
  let depth = 0
  for (let i = start; i < code.length; i++) {
    const c = code[i]
    if (c === '"') {
      for (i++; code[i] !== '"'; i++) if (code[i] === '\\') i++
      continue
    }
    if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') {
      depth--
      if (depth === 0) return code.slice(start, i + 1)
    }
  }
  throw new Error('fin du tableau introuvable')
}

const at = code.indexOf('const wye=[')
if (at < 0) throw new Error('liste des styles (wye) introuvable dans le bundle')
const all = vm.runInNewContext(`(${literal(at + 'const wye='.length)})`)
const first = all.findIndex((t) => t.style === 'Centered Serif List')
const picker = all.slice(first < 0 ? 0 : first).filter((t, i, list) => list.findIndex((r) => r.style === t.style) === i)

const styles = JSON.parse(readFileSync(join(ROOT, 'vendor', 'design', 'styles.json'), 'utf8'))
const known = new Set(styles.variants.map((v) => v.name))

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const base = (p) => p.slice(p.lastIndexOf('/') + 1)
/** Haut de la vignette, `w` px de large et `h` px de haut, en WebP qualité 78. */
const shrink = (src, dest, w, h) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(editor, src), '-vf', `scale=${w}:-2,crop=${w}:${h}:0:0`, '-c:v', 'libwebp', '-quality', '78', join(OUT, dest)])

const entries = []
for (const t of picker) {
  if (!known.has(t.name)) throw new Error(`variante absente de styles.json : ${t.name} (relancer extract-pen-styles.mjs)`)
  const web = base(t.thumbnailWeb)
  const mobile = base(t.thumbnailMobile)
  shrink(t.thumbnailWeb, web, 360, 280)
  shrink(t.thumbnailMobile, mobile, 220, 280)
  entries.push({ name: t.name, style: t.style, params: t.params, web, mobile })
}
writeFileSync(join(OUT, 'picker.json'), `${JSON.stringify(entries, null, 1)}\n`)
let bytes = 0
for (const e of entries) bytes += statSync(join(OUT, e.web)).size + statSync(join(OUT, e.mobile)).size
console.log(`${entries.length} styles, ${(bytes / 1024).toFixed(0)} Ko de vignettes → ${OUT}`)
