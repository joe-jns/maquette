import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importPen, penImageUrls } from '../../src/core/pen/importPen'
import { validateDocument } from '../../src/core/rules'
import { walk } from '../../src/core/tree'

/**
 * Vrais fichiers .pen de l'utilisateur (lecture seule) : chacun s'importe sans erreur et passe le
 * validateur. Lancé à la demande seulement (fichiers hors du dépôt) :
 *   PEN_REAL=1 npx vitest run tests/core/penRealFiles.test.ts
 * Dossier fouillé : PEN_ROOT, sinon C:\Users\micro\projets. Les copies « backup » sont ignorées.
 */
const ROOT = process.env.PEN_ROOT ?? 'C:\\Users\\micro\\projets'

function penFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) penFiles(p, out)
    else if (e.name.endsWith('.pen') && !e.name.includes('backup')) out.push(p)
  }
  return out
}

describe.runIf(process.env.PEN_REAL === '1' && existsSync(ROOT))('import des vrais fichiers .pen', () => {
  it('tous s’importent, sans erreur de validation ; totaux du rapport', () => {
    const files = penFiles(ROOT)
    const totals = new Map<string, number>()
    const lines: string[] = []
    for (const f of files) {
      const json = JSON.parse(readFileSync(f, 'utf8')) as unknown
      const t0 = performance.now()
      // Images : toutes présentes (on mesure la conversion, pas la copie des fichiers).
      const { doc, report } = importPen(json, { image: (url) => `assets/${url.length}.png` })
      const ms = Math.round(performance.now() - t0)
      expect(validateDocument(doc), f).toEqual([])
      let layers = 0
      let instances = 0
      let copies = 0
      let mains = 0
      walk(doc, ({ node }) => {
        layers++
        if (node.type === 'frame' && node.instanceOf !== undefined && node.source === undefined) instances++
        if (node.source !== undefined) copies++
        if (node.type === 'frame' && node.component) mains++
      })
      for (const i of report.items) totals.set(i.label, (totals.get(i.label) ?? 0) + i.count)
      lines.push(`${f.replace(ROOT, '')} — ${layers} calques, ${mains} composants, ${instances} instances (${copies} calques liés), ${penImageUrls(json).length} images, ${ms} ms, ${report.items.length} catégories`)
    }
    process.stdout.write(`${files.length} fichiers\n${lines.join('\n')}\n\nRapport cumulé :\n${[...totals].sort((a, b) => b[1] - a[1]).map(([l, n]) => `  ${n} × ${l}`).join('\n')}`)
    expect(files.length).toBeGreaterThan(0)
  }, 300_000)
})
