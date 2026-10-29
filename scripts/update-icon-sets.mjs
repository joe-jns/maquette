/**
 * Noms des icônes Material Symbols Rounded (le paquet @material-symbols/svg-400 n'a qu'un fichier SVG
 * par icône, sans catalogue), écrits dans src/core/icons/materialNames.json.
 * À relancer après une mise à jour du paquet : node scripts/update-icon-sets.mjs
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@material-symbols/svg-400/package.json'))
const names = readdirSync(join(root, 'rounded'))
  .filter((f) => f.endsWith('.svg') && !f.endsWith('-fill.svg'))
  .map((f) => f.slice(0, -4))
  .sort()
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/core/icons/materialNames.json')
writeFileSync(out, JSON.stringify(names) + '\n')
console.log(`${names.length} icônes Material Rounded`)
