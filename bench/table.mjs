// Tableau Markdown des mesures brutes (bench/.results/results.json) : node bench/table.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const all = JSON.parse(readFileSync(join(import.meta.dirname, '.results', 'results.json'), 'utf8'))
const f = (s) => (s ? `${s.p95} / ${s.max} (${s.over50})` : '—')
const v = (x) => (x === undefined ? '—' : x)
const rows = [
  '| Scène | N | Ouverture (ms) | Survol p95/max (>50) | Pan « tout voir » p95/max (>50) | Zoom p95/max (>50) | Pan 100 % p95/max (>50) | Sélection (ms) | Glisser p95/max (>50) | Relâcher (ms) | Ctrl+Z (ms) | Entrée→édition (ms) | Lettre (ms) | Échap→validé (ms) | MCP lire / appliquer (ms) | Tas JS / rendu (Mo) | Éléments DOM |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
]
const order = Object.entries(all).map(([key, r]) => ({ ...r, kind: key.endsWith('+css') ? `${r.kind} +will-change` : r.kind }))
  .sort((a, b) => (a.kind === b.kind ? a.n - b.n : a.kind < b.kind ? 1 : -1))
for (const r of order) {
  rows.push(`| ${r.kind} | ${r.n} | ${r.openMs} | ${f(r.hover)} | ${f(r.panFit)} | ${f(r.zoom)} | ${f(r.pan100)} | ${v(r.selectMs)} | ${f(r.drag)} | ${v(r.dropMs)} | ${v(r.undoMs)} | ${v(r.editEnterMs)} | ${v(r.typeMs)} | ${v(r.textCommitMs)} | ${v(r.mcpReadMs)} / ${v(r.mcpApplyMs)} | ${r.memEnd?.heapMB ?? r.memOpen?.heapMB} / ${r.memEnd?.rendererMB ?? r.memOpen?.rendererMB} | ${r.memOpen?.domElements} |`)
}
console.log(rows.join('\n'))
