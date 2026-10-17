import { describe, it, expect } from 'vitest'
import { consigne } from '../../src/main/chat/consigne'
import { MCP_INSTRUCTIONS } from '../../src/mcp/design/instructions'
import { TOOLS } from '../../src/mcp/tools'

/**
 * Taille de la consigne du chat, envoyée avec chaque conversation : ~3 000 tokens au plus pour chaque
 * variante. Estimation prudente pour de l'anglais technique (identifiants, JSON) : 3,5 caractères par
 * token, soit 10 500 caractères. Les instructions du serveur MCP (Claude Code hors de l'app) restent
 * courtes : 700 tokens.
 */
const CHARS_PER_TOKEN = 3.5
const tokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN)

const pen = consigne('scène.maquette')
const taste = consigne('scène.maquette', { taste: true })

describe('consigne du chat', () => {
  it('tient en ~3 000 tokens, dans les deux modes', () => {
    for (const text of [pen, taste]) {
      expect(tokens(text)).toBeLessThanOrEqual(3000)
      expect(tokens(text)).toBeGreaterThan(1200)
    }
    expect(consigne('scène.maquette', { taste: false })).toBe(pen)
  })

  it('commun aux deux modes : document, petits travaux, français, modèle', () => {
    for (const text of [pen, taste]) {
      expect(text).toContain('Open document: scène.maquette')
      expect(text).toContain('Small jobs')
      expect(text).toContain('Answer the user in short, simple French')
      expect(text).toContain('Model essentials')
      expect(text).toContain('one appliquer per section')
    }
  })

  it('« garde le style » : palette, polices et graisses gardées, la demande prime sur les règles, dans les deux modes', () => {
    for (const text of [pen, taste]) {
      expect(text).toContain('Keep the source style')
      expect(text).toContain('keep its palette and its typefaces with their weights')
      expect(text).toContain('The layout may be reworked freely')
      expect(text).toContain('First identify each typeface (headings, subheadings, body, buttons)')
      expect(text).toContain('closest Google family, weight, case, italic, letter-spacing')
      expect(text).toContain('capitals stay capitals')
      expect(text).toContain('never dropped just because a taste rule forbids them')
      expect(text).toContain('never turn a structured block of the source into a wall of text')
      expect(text).toContain("The user's explicit request overrides every house rule")
    }
  })

  it('taste-skill allumé : la méthode obligatoire et les règles de goût', () => {
    for (const step of ['mandatory taste-skill method', 'Inventory', 'direction({secteur, brief, sections', 'appliquer:true', 'Competitor test', 'guide("regles-maison")', 'guide("landing-page"', 'blueprints', 'capture of the section frame + verifier_gout', 'guide("taste-critique")', 'three rounds at most']) {
      expect(taste, step).toContain(step)
    }
    expect(taste).toContain('Reduce:')
    expect(taste).toContain('no gradients')
    expect(taste).toContain('Pen styles are a complement, never a replacement')
    expect(taste).toContain('(A) With references')
    expect(taste).toContain('capture({ids:[…]})')
    expect(taste).toContain('never move or delete them')
    expect(taste).toContain('(B) Without references, always taste-skill')
  })

  it('taste-skill éteint (défaut) : méthode de Pen, style appliqué en entier, aucun interdit taste-skill', () => {
    // Flux et section Style de pen-dev (SKILL.md).
    for (const k of [
      'Verify each section immediately after you are done with it',
      'Layout is not collapsed or broken.',
      'Content is not clipped outside the frame',
      'Colour contrast on text, objects and background is sufficient.',
      'Objects are properly aligned and spaced.',
      'never delete a section to redo it',
      "Don't create repetitive styles and grids.",
      'Avoid wrapping every element in its own box or card',
      'Avoid excessive gradients, shadows and rounded corners unless requested',
      'All Google fonts are available',
      'Never draw logos, illustrations or mascots',
    ]) expect(pen, k).toContain(k)
    // Styles de Pen : choisi selon le sujet, appliqué entièrement.
    expect(pen).toContain('choose the Pen style archetype that fits the subject')
    expect(pen).toContain('style(nom, variante, appliquer:true)')
    expect(pen).toContain('applied ENTIRELY')
    for (const k of ['typefaces at their stated weights', 'palette', 'radii', 'elevation', 'imagery', 'composition rules']) expect(pen, k).toContain(k)
    expect(pen).toContain('guide("qualite")')
    expect(pen).toContain('Use the following style')
    expect(pen).toContain('Main headline 88–120 px on 1440 unless the source is bigger')
    // Références, images, icônes gardées ; verifier_gout facultatif.
    expect(pen).toContain('capture({ids:[…]})')
    expect(pen).toContain('never move or delete them')
    expect(pen).toContain('images({cherche})')
    expect(pen).toContain('verifier_gout is optional in this mode')
    // Rien n'impose taste-skill.
    for (const k of ['mandatory taste-skill', 'regles-maison', 'taste-critique', 'no gradients', 'no eyebrow', '01/02/03', 'direction({', 'Taste, always', 'identical icon cards']) {
      expect(pen, k).not.toContain(k)
    }
  })

  it('ne cite que des outils qui existent (images et icônes : « si présents »)', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    for (const text of [pen, taste]) {
      const cited = /You read and change it only through the maquette tools \(([^)]+)\)/.exec(text)![1]!.split(', ')
      for (const n of cited) expect(names, n).toContain(n)
      expect(text).toContain('if an images tool is listed')
      expect(text).toContain('if appliquer accepts type "icon"')
    }
  })

  it('instructions du serveur MCP : courtes et neutres (la consigne du chat décide de la méthode)', () => {
    expect(tokens(MCP_INSTRUCTIONS)).toBeLessThanOrEqual(700)
    for (const k of ['style(', 'direction(', 'verifier_gout', 'appliquer:true', 'capture', 'guide("methode")', 'garde le style']) expect(MCP_INSTRUCTIONS).toContain(k)
    for (const k of ['mandatory', 'always taste-skill', 'no eyebrow', 'House rules:']) expect(MCP_INSTRUCTIONS).not.toContain(k)
  })

  it('descriptions des outils : aucune n’impose taste-skill', () => {
    for (const t of TOOLS) {
      expect(t.description, t.name).not.toMatch(/obligatoire|mandatory/i)
    }
  })
})
