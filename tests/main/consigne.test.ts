import { describe, it, expect } from 'vitest'
import { consigne } from '../../src/main/chat/consigne'
import { MCP_INSTRUCTIONS } from '../../src/mcp/design/instructions'
import { TOOLS } from '../../src/mcp/tools'

/**
 * Taille de la consigne du chat, envoyée avec chaque conversation : ~3 000 tokens au plus. Estimation
 * prudente pour de l'anglais technique (identifiants, JSON) : 3,5 caractères par token, soit 10 500
 * caractères. Les instructions du serveur MCP (Claude Code hors de l'app) restent courtes : 700 tokens.
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
    for (const step of ['mandatory taste-skill method', 'Inventory', 'direction({secteur, brief, sections', 'appliquer:true', 'Competitor test', 'guide("regles-maison")', 'guide("landing-page"', 'blueprints', 'one appliquer per section', 'capture of the section frame + verifier_gout', 'guide("taste-critique")', 'three rounds at most']) {
      expect(text, step).toContain(step)
    }
    expect(text).toContain('Small jobs')
    expect(text).toContain('Answer the user in short, simple French')
    expect(text).toContain('Reduce:')
    expect(text).toContain('no gradients')
    expect(text).toContain('Pen styles are a complement, never a replacement')
    // Deux entrées : références sélectionnées sur le canevas, ou tirage taste-skill.
    expect(text).toContain('(A) With references')
    expect(text).toContain('capture({ids:[…]})')
    expect(text).toContain('never move or delete them')
    expect(text).toContain('(B) Without references, always taste-skill')
  })

  it('ne cite que des outils qui existent (images et icônes : « si présents »)', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    const cited = /You read and change it only through the maquette tools \(([^)]+)\)/.exec(text)![1]!.split(', ')
    for (const n of cited) expect(names, n).toContain(n)
    expect(text).toContain('if an images tool is listed')
    expect(text).toContain('if appliquer accepts type "icon"')
  })

  it('instructions du serveur MCP : la même méthode, en court', () => {
    expect(tokens(MCP_INSTRUCTIONS)).toBeLessThanOrEqual(700)
    for (const k of ['taste-skill method is mandatory', '(A) With references', '(B) Without references', 'direction({secteur', 'blueprints', 'guide("taste-critique")', 'verifier_gout', 'appliquer:true']) expect(MCP_INSTRUCTIONS).toContain(k)
  })
})
