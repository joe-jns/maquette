#!/usr/bin/env node
// Copie, sans modification, les textes de design lus à la demande par l'outil `guide` :
// - les skills better-* téléchargés par Pen (~/.pencil/skills, licence MIT, Jakub Krehel), avec LICENSE et ATTRIBUTION ;
// - les références de taste-skill (~/.claude/skills/design-taste-frontend/references, licence MIT, Leonxlnx).
// Les guides adaptés à Maquette (vendor/design/maquette) et les styles (scripts/extract-pen-styles.mjs) sont à part.
//
//   node scripts/update-design.mjs [dossier des skills de Pen] [dossier de taste-skill]
//
// Les sources ne sont que lues.

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'vendor', 'design')
const PEN = resolve(process.argv[2] ?? join(homedir(), '.pencil', 'skills'))
const TASTE = resolve(process.argv[3] ?? join(homedir(), '.claude', 'skills', 'design-taste-frontend'))

const BETTER = ['better-typography', 'better-colors', 'better-layout', 'better-ui', 'better-interface', 'better-writing', 'better-accessibility']
const TASTE_REFS = ['type', 'colour', 'layout', 'copy', 'critique', 'tells', 'imagery']

function fail(message) {
  console.error(`update-design : ${message}`)
  process.exit(1)
}

const files = []
const copy = (from, rel) => {
  if (!existsSync(from)) fail(`fichier manquant : ${from}`)
  const to = join(DEST, rel)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  files.push(rel)
}

rmSync(join(DEST, 'better'), { recursive: true, force: true })
rmSync(join(DEST, 'taste'), { recursive: true, force: true })

for (const skill of BETTER) {
  const dir = join(PEN, skill)
  if (!existsSync(dir)) fail(`skill introuvable : ${dir}`)
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.md') || name === 'LICENSE') copy(join(dir, name), `better/${skill}/${name}`)
  }
}

for (const ref of TASTE_REFS) copy(join(TASTE, 'references', `${ref}.md`), `taste/${ref}.md`)
// Même licence que la copie de taste-skill (vendor/taste-skill/LICENSE).
copy(join(ROOT, 'vendor', 'taste-skill', 'LICENSE'), 'taste/LICENSE')

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const lines = files.map((rel) => `${sha256(readFileSync(join(DEST, rel)))}  ${rel}`)
writeFileSync(join(DEST, 'SOURCES'), [
  'Textes copiés tels quels (scripts/update-design.mjs) :',
  `- better-* : skills de Jakub Krehel téléchargés par Pen (${PEN}), licence MIT (LICENSE et ATTRIBUTION.md de chaque dossier)`,
  `- taste/ : références de taste-skill, https://github.com/Leonxlnx/taste-skill, licence MIT (taste/LICENSE)`,
  '- styles.json : styles archétypes de Pen (get_style), extraits par scripts/extract-pen-styles.mjs, usage personnel',
  '- maquette/ : guides de Pen (pen-dev) et règles de taste-skill réécrits pour Maquette',
  `date: ${new Date().toISOString()}`,
  '',
  ...lines,
  '',
].join('\n'))
console.log(`${files.length} fichiers copiés dans ${DEST}`)
