import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const VENDOR = resolve(__dirname, '../../vendor/taste-skill')

const EXPECTED = [
  'scripts/draw.mjs',
  'scripts/assets.mjs',
  'scripts/lib/probe.mjs',
  'scripts/lib/rules.mjs',
  'scripts/lib/cdp.mjs',
  'README.md',
  'SKILL.md',
  'LICENSE',
  'VERSION',
  'library/type.json',
  'library/palettes.json',
  'library/directions.json',
]

describe('copie de taste-skill', () => {
  it('contient les fichiers attendus', () => {
    for (const rel of EXPECTED) expect(existsSync(join(VENDOR, rel)), rel).toBe(true)
    expect(readdirSync(join(VENDOR, 'library')).filter((f) => f.endsWith('.json')).length).toBeGreaterThan(0)
  })

  it('rules.mjs exporte judge et RULE_IDS', async () => {
    const rules = await import('../../vendor/taste-skill/scripts/lib/rules.mjs')
    expect(typeof rules.judge).toBe('function')
    expect(Array.isArray(rules.RULE_IDS)).toBe(true)
    expect(rules.RULE_IDS.length).toBeGreaterThan(0)
  })

  it('probe.mjs exporte probe', async () => {
    const mod = await import('../../vendor/taste-skill/scripts/lib/probe.mjs')
    expect(typeof mod.probe).toBe('function')
  })

  it('draw.mjs --list sectors répond', () => {
    const out = execFileSync(process.execPath, [join(VENDOR, 'scripts/draw.mjs'), '--list', 'sectors'], {
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(out.split(/\r?\n/).map((s) => s.trim())).toContain('restaurant')
  })
})
