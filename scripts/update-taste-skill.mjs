#!/usr/bin/env node
// Met à jour la copie de taste-skill (https://github.com/Leonxlnx/taste-skill, licence MIT)
// dans vendor/taste-skill/. Les fichiers sont copiés tels quels, sans aucune modification.
//
//   node scripts/update-taste-skill.mjs [source]
//
// source par défaut : ~/.claude/skills/design-taste-frontend

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'vendor', 'taste-skill')
const SOURCE = resolve(process.argv[2] ?? join(homedir(), '.claude', 'skills', 'design-taste-frontend'))

// Texte de https://github.com/Leonxlnx/taste-skill/blob/main/LICENSE, inscrit tel quel.
const LICENSE = `MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const FIXED = [
  'scripts/draw.mjs',
  'scripts/assets.mjs',
  'scripts/lib/probe.mjs',
  'scripts/lib/rules.mjs',
  'scripts/lib/cdp.mjs',
  'README.md',
  'SKILL.md',
]

function fail(message) {
  console.error(`update-taste-skill : ${message}`)
  process.exit(1)
}

if (!existsSync(SOURCE)) fail(`source introuvable : ${SOURCE}`)
const libDir = join(SOURCE, 'library')
if (!existsSync(libDir)) fail(`bibliothèque introuvable : ${libDir}`)

const library = readdirSync(libDir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => `library/${name}`)
if (library.length === 0) fail(`aucun fichier JSON dans ${libDir}`)

const files = [...library, ...FIXED]
for (const rel of files) {
  if (!existsSync(join(SOURCE, rel))) fail(`fichier manquant dans la source : ${rel}`)
}

rmSync(DEST, { recursive: true, force: true })

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const lines = []
const combined = createHash('sha256')
for (const rel of files) {
  const from = join(SOURCE, rel)
  const to = join(DEST, rel)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  const digest = sha256(readFileSync(to))
  combined.update(`${rel}\0${digest}\n`)
  lines.push(`${digest}  ${rel}`)
}

writeFileSync(join(DEST, 'LICENSE'), LICENSE)

const version = [
  'taste-skill — https://github.com/Leonxlnx/taste-skill (licence MIT)',
  `date: ${new Date().toISOString()}`,
  `sha256: ${combined.digest('hex')}`,
  '',
  ...lines,
  '',
].join('\n')
writeFileSync(join(DEST, 'VERSION'), version)

console.log(`taste-skill copié dans ${DEST} (${files.length} fichiers + LICENSE + VERSION)`)
