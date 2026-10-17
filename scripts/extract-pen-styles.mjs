#!/usr/bin/env node
// Extrait les styles archétypes de Pen (get_style : les 26 de son SKILL.md et les plus récents) et
// leurs paramètres concrets (palettes, arrondis, élévations, imageries, variantes) depuis le bundle
// de l'éditeur de Pen, vers vendor/design/styles.json. Usage personnel ; le bundle n'est que lu.
//
//   node scripts/extract-pen-styles.mjs <chemin de out/editor/assets/index.js>
//
// Le catalogue Google Fonts (réseau) est lu au passage : chaque police des variantes doit y être
// (Maquette les charge de là), et ses graisses disponibles sont gardées (`fontWeights`).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'vendor', 'design', 'styles.json')
const src = process.argv[2]
if (!src) {
  console.error('usage : node scripts/extract-pen-styles.mjs <index.js de Pen>')
  process.exit(1)
}
const code = readFileSync(src, 'utf8')

/** Fin de l'expression littérale (objet ou tableau) qui commence à `start` : chaînes et gabarits sautés. */
function literalEnd(start) {
  let depth = 0
  for (let i = start; i < code.length; i++) {
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < code.length && code[i] !== c; i++) {
        if (code[i] === '\\') i++
        else if (c === '`' && code[i] === '$' && code[i + 1] === '{') throw new Error(`gabarit avec expression à ${i}`)
      }
      continue
    }
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  throw new Error(`littéral non fermé à ${start}`)
}

/** Valeur du littéral assigné à `name`, repéré par le début de son texte (`name=` + `head`, unique). */
function literalOf(name, head) {
  const anchor = `${name}=${head}`
  const at = code.indexOf(anchor)
  if (at < 0) throw new Error(`ancre introuvable : ${anchor}`)
  if (code.indexOf(anchor, at + 1) >= 0) throw new Error(`ancre ambiguë : ${anchor}`)
  const start = at + name.length + 1
  return vm.runInNewContext(`(${code.slice(start, literalEnd(start))})`, Object.create(null), { timeout: 2000 })
}

/** Nom de variable minifiée assignée juste avant un texte connu (`,xyz={"Clé"`). */
function varBefore(text) {
  const at = code.indexOf(text)
  if (at < 0) throw new Error(`texte introuvable : ${text}`)
  const m = /([A-Za-z_$][\w$]*)=$/.exec(code.slice(at - 12, at))
  if (!m) throw new Error(`variable introuvable avant : ${text}`)
  return m[1]
}

// L'objet des styles, puis la table qui relie chaque source à ses préréglages (noms minifiés lus au passage).
const stylesVar = varBefore('{"Aerial Gravitas":{content:`')
const styles = literalOf(stylesVar, '{"Aerial Gravitas":{content:`')
const sourcesAt = code.indexOf('={fonts:{options:')
const sources = code.slice(sourcesAt, sourcesAt + 400)
const pick = (re) => {
  const m = re.exec(sources)
  if (!m) throw new Error(`table des sources illisible : ${re}`)
  return m[1]
}
const fontsVar = pick(/fonts:\{options:([\w$]+)\}/)
const palettesVar = pick(/colors:\{options:Object\.keys\(([\w$]+)\)/)
const roundVar = pick(/roundness:\{options:Object\.keys\(([\w$]+)\)/)
const elevVar = pick(/elevation:\{options:Object\.keys\(([\w$]+)\)/)
const imageryVar = pick(/"imagery\.decorative":\{options:Object\.keys\(([\w$]+)\)/)

const fonts = literalOf(fontsVar, '["')
const palettes = literalOf(palettesVar, '{"')
const roundness = literalOf(roundVar, '{"')
const elevation = literalOf(elevVar, '{"')
const imagery = literalOf(imageryVar, '{"')
const variantsVar = varBefore('[{name:"Aerial Gravitas - ')
const variants = literalOf(variantsVar, '[{name:"Aerial Gravitas - ')

const clean = (s) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim() : s)

// La partie « # Design quality » est la même pour tous les styles : gardée une fois (`quality`,
// guide « qualite »), retirée de chaque fiche.
const QUALITY = '# Design quality'
const tails = new Set(Object.values(styles).map((s) => clean(s.content).split(QUALITY)[1]))
if (tails.size !== 1 || tails.has(undefined)) throw new Error('la partie « Design quality » diffère d’un style à l’autre')

const out = {
  source: 'Pen (pen.dev) 1.2.18 — styles de get_style, usage personnel',
  quality: `${QUALITY}${[...tails][0]}`,
  styles: Object.entries(styles).map(([name, s]) => ({
    name,
    description: clean(s.description ?? ''),
    content: clean(clean(s.content).split(QUALITY)[0]),
    parameters: s.parameters ?? {},
  })),
  variants: variants.map((v) => ({ name: v.name, style: v.style, params: v.params })),
  palettes,
  roundness,
  elevation: Object.fromEntries(Object.entries(elevation).map(([name, levels]) => [
    name,
    Object.fromEntries(Object.entries(levels).map(([level, list]) => [
      level,
      list.map((sh) => ({ x: sh.offset?.x ?? 0, y: sh.offset?.y ?? 0, blur: sh.blur ?? 0, spread: sh.spread ?? 0, color: sh.color, inset: sh.shadowType === 'inner' })),
    ])),
  ])),
  imagery: Object.fromEntries(Object.entries(imagery).map(([k, v]) => [k, clean(v)])),
  fonts,
}

// Cohérence : chaque variante pointe vers un style, une palette, un arrondi, une élévation, une imagerie connus.
const problems = []
const names = new Set(out.styles.map((s) => s.name))
for (const v of out.variants) {
  if (!names.has(v.style)) problems.push(`${v.name} : style inconnu`)
  const p = v.params
  if (p.colorPalette && !palettes[p.colorPalette]) problems.push(`${v.name} : palette ${p.colorPalette}`)
  if (p.roundness && !roundness[p.roundness]) problems.push(`${v.name} : arrondi ${p.roundness}`)
  if (p.elevation && !elevation[p.elevation]) problems.push(`${v.name} : élévation ${p.elevation}`)
  if (p.decorativeImagery && !imagery[p.decorativeImagery]) problems.push(`${v.name} : imagerie ${p.decorativeImagery}`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}

// Polices des variantes : toutes au catalogue Google Fonts, graisses disponibles gardées.
const FONT_ROLES = ['headings', 'body', 'captions', 'data', 'expression']
const catalogText = await (await fetch('https://fonts.google.com/metadata/fonts')).text()
const catalog = new Map(JSON.parse(catalogText.slice(catalogText.indexOf('{'))).familyMetadataList.map((f) => [f.family, f]))
const used = [...new Set(out.variants.flatMap((v) => FONT_ROLES.map((r) => v.params[r]).filter(Boolean)))].sort()
const missing = used.filter((f) => !catalog.has(f))
console.log(`${used.length} polices utilisées, ${missing.length} absentes de Google Fonts${missing.length ? ' : ' + missing.join(', ') : ''}`)
if (missing.length) process.exit(1)
out.fontWeights = Object.fromEntries(used.map((family) => {
  const keys = Object.keys(catalog.get(family).fonts ?? {})
  return [family, [...new Set(keys.map((k) => parseInt(k, 10)).filter(Number.isFinite))].sort((a, b) => a - b)]
}))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(`${out.styles.length} styles, ${out.variants.length} variantes, ${Object.keys(palettes).length} palettes, ${Object.keys(roundness).length} arrondis, ${Object.keys(elevation).length} élévations, ${Object.keys(imagery).length} imageries, ${fonts.length} polices → ${OUT}`)
