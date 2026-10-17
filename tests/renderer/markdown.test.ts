import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseInline, parseMarkdown } from '../../src/renderer/chat/markdown'
import { MessageText } from '../../src/renderer/chat/MessageText'

const html = (text: string) => renderToStaticMarkup(createElement(MessageText, { text }))

describe('parseInline', () => {
  it('gras, italique et code', () => {
    expect(parseInline('un **gras** et *penché* avec `x = 1`')).toEqual([
      { t: 'text', text: 'un ' },
      { t: 'strong', children: [{ t: 'text', text: 'gras' }] },
      { t: 'text', text: ' et ' },
      { t: 'em', children: [{ t: 'text', text: 'penché' }] },
      { t: 'text', text: ' avec ' },
      { t: 'code', text: 'x = 1' },
    ])
  })

  it('marques non fermées ou entourées d’espaces : texte tel quel', () => {
    expect(parseInline('2 * 3 * 4 et **pas fini')).toEqual([{ t: 'text', text: '2 * 3 * 4 et **pas fini' }])
    expect(parseInline('nom_de_fichier.ts')).toEqual([{ t: 'text', text: 'nom_de_fichier.ts' }])
  })

  it('le code garde ses étoiles', () => {
    expect(parseInline('`a**b**`')).toEqual([{ t: 'code', text: 'a**b**' }])
  })

  it('liens nus et [texte](url) en http(s) ; la ponctuation finale reste dehors', () => {
    expect(parseInline('Voir https://exemple.be/page.')).toEqual([
      { t: 'text', text: 'Voir ' },
      { t: 'link', href: 'https://exemple.be/page', children: [{ t: 'text', text: 'https://exemple.be/page' }] },
      { t: 'text', text: '.' },
    ])
    expect(parseInline('[la doc](https://exemple.be)')).toEqual([
      { t: 'link', href: 'https://exemple.be', children: [{ t: 'text', text: 'la doc' }] },
    ])
  })

  it('un lien qui n’est pas http(s) reste du texte', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', text: '[x](javascript:alert(1))' }])
  })
})

describe('parseMarkdown', () => {
  it('paragraphes, listes, titres et blocs de code', () => {
    const blocks = parseMarkdown('# Plan\n\nLigne 1\nLigne 2\n\n- a\n- b\n\n3. trois\n4. quatre\n\n```ts\nconst a = 1\n```')
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'p', 'list', 'list', 'code'])
    expect(blocks[1]).toMatchObject({ lines: [[{ text: 'Ligne 1' }], [{ text: 'Ligne 2' }]] })
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] })
    expect(blocks[3]).toMatchObject({ ordered: true, start: 3 })
    expect(blocks[4]).toEqual({ t: 'code', text: 'const a = 1' })
  })

  it('bloc de code pas encore fermé (texte qui arrive) : tout le reste est du code', () => {
    expect(parseMarkdown('Voici :\n```\nligne **1**')).toEqual([
      { t: 'p', lines: [[{ t: 'text', text: 'Voici :' }]] },
      { t: 'code', text: 'ligne **1**' },
    ])
  })
})

describe('MessageText (rendu)', () => {
  it('le HTML écrit par Claude est affiché comme du texte', () => {
    const out = html('<img src=x onerror="alert(1)"> **<b>gras</b>**')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;img')
    expect(out).toContain('<strong>&lt;b&gt;gras&lt;/b&gt;</strong>')
  })

  it('les liens ne sont pas des liens : ni <a>, ni href, ni fenêtre', () => {
    const out = html('Va sur https://exemple.be et [ici](https://autre.be)')
    expect(out).not.toMatch(/<a[\s>]/)
    expect(out).not.toContain('href=')
    expect(out).toContain('<span class="chat-link" title="https://exemple.be">https://exemple.be</span>')
    expect(out).toContain('<span class="chat-link" title="https://autre.be">ici</span>')
  })

  it('listes et code', () => {
    expect(html('- un\n- deux')).toBe('<ul><li>un</li><li>deux</li></ul>')
    expect(html('```\n<div>\n```')).toBe('<pre><code>&lt;div&gt;</code></pre>')
  })
})
