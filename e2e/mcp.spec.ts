import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch } from './launch'

/** Claude Code de bout en bout : un vrai client MCP lance le relais, qui rejoint l'app ouverte. */
test.describe('connexion Claude Code (MCP)', () => {
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\maquette-e2e-${process.pid}` : join(tmpdir(), `maquette-e2e-${process.pid}.sock`)
  const userData = mkdtempSync(join(tmpdir(), 'maquette-mcp-'))
  const env = { MAQUETTE_PIPE: pipe, MAQUETTE_USER_DATA: userData }

  async function client(exe: string, extra: Record<string, string> = {}): Promise<Client> {
    const transport = new StdioClientTransport({
      command: exe,
      args: [resolve('out/main/relay.js')],
      env: { ...(process.env as Record<string, string>), ...env, ...extra, ELECTRON_RUN_AS_NODE: '1' },
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
      // Le curseur de Claude glisse vers le carré créé : sa pointe tombe dans le carré.
      const cursor = page.getByTestId('agent-cursor-claude')
      await expect(cursor).toBeVisible()
      await expect.poll(async () => {
        const [b, c] = [(await el.boundingBox())!, (await cursor.boundingBox())!]
        return c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height
      }).toBe(true)

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

  test('app fermée, démarrage automatique coupé : message clair, pas de plantage du relais', async () => {
    const { app } = await launch([], env)
    const exe = await app.evaluate(() => process.execPath)
    await app.close()
    const c = await client(exe, { MAQUETTE_NO_AUTOSTART: '1' })
    try {
      const r = await c.callTool({ name: 'lire_document', arguments: {} })
      expect(r.isError).toBe(true)
      expect(textOf(r)).toContain('Maquette n’est pas ouverte')
    } finally {
      await c.close()
    }
  })

  test('app fermée : le relais la lance sans fenêtre ; fichier nouveau, appliquer, enregistrer ; arrêt seul après inactivité', async () => {
    test.setTimeout(90_000)
    const { app } = await launch([], env)
    const exe = await app.evaluate(() => process.execPath)
    await app.close()
    const dir = mkdtempSync(join(tmpdir(), 'maquette-sans-app-'))
    const file = join(dir, 'claude.maquette')
    // Arrêt après 4 s sans appel, pour que le test ne laisse pas d'app cachée derrière lui.
    const c = await client(exe, { MAQUETTE_HEADLESS_IDLE_MS: '4000' })
    try {
      const etat = JSON.parse(textOf(await c.callTool({ name: 'fichier', arguments: { action: 'etat' } })))
      expect(etat.visible).toBe(false)
      const cree = await c.callTool({ name: 'fichier', arguments: { action: 'nouveau', chemin: file } })
      expect(cree.isError).toBeFalsy()
      const lu = JSON.parse(textOf(await c.callTool({ name: 'lire_document', arguments: {} })))
      const r = await c.callTool({
        name: 'appliquer',
        arguments: { operations: [{ op: 'create', parent: lu.pages[0].id, node: { id: '$r', type: 'shape', shape: 'rectangle', name: 'Sans app', x: 0, y: 0, width: 80, height: 80, fills: ['#C2410C'] } }] },
      })
      expect(r.isError).toBeFalsy()
      const rect = Object.values(JSON.parse(textOf(r)).ids ?? {})[0] as string | undefined
      expect((await c.callTool({ name: 'fichier', arguments: { action: 'enregistrer' } })).isError).toBeFalsy()
      expect(await readFile(file, 'utf8')).toContain('Sans app')
      const cap = await c.callTool({ name: 'capture', arguments: { id: rect ?? '', largeur: 200 } })
      expect((cap.content as { type: string }[]).some((x) => x.type === 'image')).toBe(true)
      // Écraser un autre fichier sans remplacer:true : refusé.
      const autre = await c.callTool({ name: 'fichier', arguments: { action: 'nouveau', chemin: file } })
      expect(autre.isError).toBe(true)
      expect(textOf(autre)).toContain('remplacer:true')
      // Refus avant tout changement : le document affiché est toujours le fichier enregistré.
      expect(JSON.parse(textOf(await c.callTool({ name: 'fichier', arguments: { action: 'etat' } }))).chemin).toBe(file)
    } finally {
      await c.close()
    }
    // Plus d'appel : l'app cachée s'arrête seule ; un relais sans démarrage automatique la trouve fermée.
    const after = await client(exe, { MAQUETTE_NO_AUTOSTART: '1' })
    try {
      // Chaque appel repousse l'arrêt : on attend sans rien demander, puis une seule question.
      await new Promise((r) => setTimeout(r, 9000))
      expect(textOf(await after.callTool({ name: 'lire_document', arguments: {} }))).toContain('Maquette n’est pas ouverte')
    } finally {
      await after.close()
    }
  })
})
