// Résumé des profils CPU (bench/.results/profil-*.cpuprofile) : temps propre par fonction, ramené au
// fichier source d'origine grâce à la carte de sources du build de profilage.
//   node bench/profile-summary.mjs site-2000 [top]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SourceMapConsumer } from 'source-map-js'

const dir = join(import.meta.dirname, '.results')
const [prefix = 'site-2000', topArg = '15'] = process.argv.slice(2)
const top = Number(topArg)
const assets = join(import.meta.dirname, '..', 'out', 'renderer', 'assets')
const mapFile = readdirSync(assets).find((f) => f.endsWith('.js.map'))
const consumer = mapFile ? new SourceMapConsumer(JSON.parse(readFileSync(join(assets, mapFile), 'utf8'))) : null

const where = (cf) => {
  if (!cf.url) return cf.functionName || '(natif)'
  if (consumer && cf.url.includes('/assets/')) {
    const o = consumer.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber })
    if (o.source) return `${o.source.replace(/^.*?(src\/|node_modules\/)/, '$1')}:${o.line}`
  }
  return `${cf.url.split('/').pop()}:${cf.lineNumber + 1}`
}

for (const file of readdirSync(dir).filter((f) => f.startsWith(`profil-${prefix}-`) && f.endsWith('.cpuprofile'))) {
  const p = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const dt = p.timeDeltas
  let total = 0
  p.samples.forEach((id, i) => {
    const n = byId.get(id)
    const d = (dt[i + 1] ?? 0) / 1000
    total += d
    const key = `${n.callFrame.functionName || '(anonyme)'} — ${where(n.callFrame)}`
    self.set(key, (self.get(key) ?? 0) + d)
  })
  const idle = [...self].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0)
  console.log(`\n## ${file}  (total ${total.toFixed(0)} ms, hors repos ${(total - idle).toFixed(0)} ms)`)
  for (const [k, v] of [...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.log(`${v.toFixed(1).padStart(8)} ms  ${k}`)
  }
  // Qui paie les parcours d'arbre (walk/findNode) et la validation zod : temps attribué au premier
  // appelant hors de tree.ts / zod / immer.
  const parent = new Map()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const lib = (cf) => /tree\.ts|zod|immer|rules\.ts/.test(where(cf))
  const callers = new Map()
  p.samples.forEach((id, i) => {
    let n = byId.get(id)
    if (!lib(n.callFrame)) return
    while (n && lib(n.callFrame)) n = byId.get(parent.get(n.id))
    if (!n) return
    const key = `${n.callFrame.functionName || '(anonyme)'} — ${where(n.callFrame)}`
    callers.set(key, (callers.get(key) ?? 0) + (dt[i + 1] ?? 0) / 1000)
  })
  const list = [...callers].sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (list.length) console.log('  appelants des parcours d’arbre / zod / immer :')
  for (const [k, v] of list) console.log(`${v.toFixed(1).padStart(8)} ms    ← ${k}`)
}
