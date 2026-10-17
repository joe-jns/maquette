/**
 * Anciens noms des icônes Lucide (renommées au fil des versions : « home » → « house »…),
 * relus dans les exports de lucide-static et écrits dans src/core/icons/lucideAliases.json.
 * À relancer après une mise à jour de lucide-static : node scripts/update-lucide-aliases.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('lucide-static/package.json'))
const src = readFileSync(join(root, 'dist/esm/lucide-static.mjs'), 'utf8')
const nodes = JSON.parse(readFileSync(join(root, 'icon-nodes.json'), 'utf8'))
const kebab = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').replace(/([a-zA-Z])(\d)/g, '$1-$2').toLowerCase()

const aliases = {}
for (const m of src.matchAll(/export \{([^}]+)\} from '\.\/icons\/([a-z0-9-]+)\.mjs'/g)) {
  const target = m[2]
  for (const part of m[1].split(',')) {
    const name = /default as (\w+)/.exec(part)?.[1]
    if (!name) continue
    const alias = kebab(name)
    // Un ancien nom qui est aussi le nom d'une icône actuelle n'est pas un alias.
    if (alias !== target && !nodes[alias]) aliases[alias] = target
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/core/icons/lucideAliases.json')
writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(aliases).sort())) + '\n')
console.log(`${Object.keys(aliases).length} anciens noms écrits dans ${out}`)
