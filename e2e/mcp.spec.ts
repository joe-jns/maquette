import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from './launch'

/** Claude Code de bout en bout : un vrai client MCP lance le relais, qui rejoint l'app ouverte. */
test.describe('connexion Claude Code (MCP)', () => {
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\maquette-e2e-${process.pid}` : join(tmpdir(), `maquette-e2e-${process.pid}.sock`)
  const userData = mkdtempSync(join(tmpdir(), 'maquette-mcp-'))
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: userData }

  async function client(exe: string): Promise<Client> {
    const transport = new StdioClientTransport({
      command: exe,
      args: [resolve('out/main/relay.js')],
      env: { ...(process.env as Record<string, string>), ...env, ELECTRON_RUN_AS_NODE: '1' },
    })
    const c = new Client({ name: 'e2e', version: '1.0.0' })
    await c.connect(transport)
    return c
  }

  const textOf = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text ?? ''

  test('lire, appliquer (visible et annulable en une fois), capturer', async () => {
    const { app, page } = await launch([], env)
    const exe = await app.evaluate(() => process.execPath)
    await expect(page.getByTestId('canvas')).toBeVisible()
    const c = await client(exe)
    try {
      const { tools } = await c.listTools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['lire_document', 'lire_elements', 'chercher', 'appliquer', 'capture', 'selection', 'verifier_gout', 'images', 'icones', 'guide', 'style', 'direction']))

      const lu = JSON.parse(textOf(await c.callTool({ name: 'lire_document', arguments: {} })))
      expect(lu.pages).toHaveLength(1)

      const r = await c.callTool({
        name: 'appliquer',
        arguments: { libelle: 'carré', operations: [{ op: 'create', parent: lu.pages[0].id, node: { id: '$c', type: 'shape', shape: 'rectangle', name: 'Carré Claude', x: 100, y: 100, width: 120, height: 120, fills: ['#C2410C'] } }] },
      })
      expect(r.isError).toBeFalsy()
      const id = JSON.parse(textOf(r)).ids.$c as string
      const el = page.locator(`.canvas [data-node-id="${id}"]`)
      await expect(el).toBeVisible()
      await expect(el).toHaveAttribute('data-claude-flash', '')
      await expect(el).not.toHaveAttribute('data-claude-flash', { timeout: 3000 })

      const cap = await c.callTool({ name: 'capture', arguments: { id, largeur: 200 } })
      const image = (cap.content as { type: string; mimeType?: string; data?: string }[]).find((x) => x.type === 'image')
      expect(image?.mimeType).toBe('image/jpeg')
      expect(image?.data?.length).toBeGreaterThan(100)

      await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('Control+z')
      await expect(el).toHaveCount(0)

      // verifier_gout : les règles de taste-skill sur le rendu réel d'un cadre dessiné par Claude.
      const page2 = await c.callTool({
        name: 'appliquer',
        arguments: { operations: [
          { op: 'create', parent: lu.pages[0].id, node: { id: '$p', type: 'frame', name: 'Page', x: 0, y: 0, width: 1440, height: 900, fills: ['#FFFFFF'], layout: { mode: 'auto', direction: 'column', padding: [120, 120, 120, 120] } } },
          { op: 'create', parent: '$p', node: { type: 'text', content: 'Un titre beaucoup trop long qui tient sur bien plus que deux lignes à cette taille-là', fontSize: 96, width: 800, textSizing: 'auto-height' } },
        ] },
      })
      const pageId = JSON.parse(textOf(page2)).ids.$p as string
      const gout = await c.callTool({ name: 'verifier_gout', arguments: { id: pageId } })
      expect(gout.isError).toBeFalsy()
      const data = JSON.parse(textOf(gout))
      expect(data.page).toBe(true)
      expect(data.fautes.map((f: string[]) => f[1])).toContain('headline-lines')
    } finally {
      await c.close()
      await app.close()
    }
  })

  test('design : instructions du serveur, guide, style appliqué en une seule annulation, direction tirée', async () => {
    // Polices hors connexion : l'application n'attend pas le réseau.
    const { app, page } = await launch([], { ...env, MAQUETTE_FONTS_OFFLINE: '1' })
    const exe = await app.evaluate(() => process.execPath)
    await expect(page.getByTestId('canvas')).toBeVisible()
    const c = await client(exe)
    try {
      expect(c.getInstructions()).toContain('guide("methode")')

      const sommaire = await c.callTool({ name: 'guide', arguments: {} })
      expect(textOf(sommaire)).toContain('- landing-page :')
      expect((await c.callTool({ name: 'guide', arguments: { sujet: 'landing-page' } })).isError).toBeFalsy()
      expect((await c.callTool({ name: 'guide', arguments: { sujet: '../../package.json' } })).isError).toBe(true)

      const r = await c.callTool({ name: 'style', arguments: { nom: 'Artisan Editorial', variante: 'Heritage Warmth', appliquer: true } })
      expect(r.isError, textOf(r)).toBeFalsy()
      const out = JSON.parse(textOf(r).split('\n\n')[0]!)
      const read = async () => JSON.parse(textOf(await c.callTool({ name: 'lire_document', arguments: {} })))
      const lu = await read()
      expect(lu.textes['Titre 1']).toBe('Fraunces 600 72/79')
      expect(lu.ids_styles.Accent).toBe(out.couleurs.Accent)
      expect(Object.keys(lu.couleurs)).toHaveLength(7)

      // Couleurs et styles de texte partent d'un seul Ctrl+Z.
      await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
      await page.keyboard.press('Control+z')
      await expect.poll(async () => (await read()).couleurs).toBeUndefined()
      expect((await read()).textes).toBeUndefined()

      // direction : vrai tirage de taste-skill, puis la fiche choisie appliquée.
      const brief = { secteur: 'restaurant', brief: 'bistrot de quartier', sections: ['intro', 'gallery', 'contact'] }
      const options = textOf(await c.callTool({ name: 'direction', arguments: brief }))
      const choix = /^## (\S+) — /m.exec(options)![1]!
      const d = await c.callTool({ name: 'direction', arguments: { ...brief, choix, appliquer: true } })
      expect(d.isError, textOf(d)).toBeFalsy()
      expect(textOf(d)).toContain('## Hero — ')
      expect(Object.keys((await read()).couleurs)).toEqual(expect.arrayContaining(['Fond', 'Encre', 'Accent']))
    } finally {
      await c.close()
      await app.close()
    }
  })

  test('app fermée : message clair, pas de plantage du relais', async () => {
    const { app } = await launch([], env)
    const exe = await app.evaluate(() => process.execPath)
    await app.close()
    const c = await client(exe)
    try {
      const r = await c.callTool({ name: 'lire_document', arguments: {} })
      expect(r.isError).toBe(true)
      expect(textOf(r)).toContain('Maquette n’est pas ouverte')
    } finally {
      await c.close()
    }
  })
})
