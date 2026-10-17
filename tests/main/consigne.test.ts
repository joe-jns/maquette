import { describe, it, expect } from 'vitest'
import { consigne } from '../../src/main/chat/consigne'
import { MCP_INSTRUCTIONS } from '../../src/mcp/design/instructions'
import { TOOLS } from '../../src/mcp/tools'

/**
 * Taille de la consigne du chat, envoyée avec chaque conversation : ~3 000 tokens au plus. Estimation
 * prudente pour de l'anglais technique (identifiants, JSON) : 3,5 caractères par token, soit 10 500
 * caractères. Les instructions du serveur MCP (Claude Code hors de l'app) restent courtes : 600 tokens.
 */
const CHARS_PER_TOKEN = 3.5
const tokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN)

describe('consigne du chat', () => {
  const text = consigne('scène.maquette')

  it('tient en ~3 000 tokens', () => {
    expect(tokens(text)).toBeLessThanOrEqual(3000)
    expect(tokens(text)).toBeGreaterThan(1200)
  })

  it('porte la méthode obligatoire et les règles de goût', () => {
    expect(text).toContain('Open document: scène.maquette')
    for (const step of ['lire_document', 'style()', 'direction({secteur, brief, sections})', 'appliquer:true', 'guide("landing-page"', 'one appliquer per section', 'capture of the section frame + verifier_gout', 'final checklist']) {
      expect(text, step).toContain(step)
    }
    expect(text).toContain('Small jobs')
    expect(text).toContain('Answer the user in short, simple French')
    expect(text).toContain('Reduce:')
    expect(text).toContain('no gradients')
  })

  it('ne cite que des outils qui existent (images et icônes : « si présents »)', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    const cited = /You read and change it only through the maquette tools \(([^)]+)\)/.exec(text)![1]!.split(', ')
    for (const n of cited) expect(names, n).toContain(n)
    expect(text).toContain('if an images tool is listed')
    expect(text).toContain('if appliquer accepts type "icon"')
  })

  it('instructions du serveur MCP : la même méthode, en court', () => {
    expect(tokens(MCP_INSTRUCTIONS)).toBeLessThanOrEqual(600)
    for (const k of ['style', 'direction', 'guide(', 'verifier_gout', 'appliquer:true']) expect(MCP_INSTRUCTIONS).toContain(k)
  })
})
