import { test, expect, type Page } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolve } from 'node:path'
import { engineSetup, type EngineSetup } from './chat'
import { launch } from './launch'

/**
 * Annuler toute une réponse de Claude (Ctrl+Z, bouton Undo) et historique de versions, avec le faux
 * `claude` (jamais le vrai) : une réponse qui crée trois calques en trois appels d'outil.
 */

const CALQUES = ['Calque 1', 'Calque 2', 'Calque 3']

type Store = { getState(): { doc: { pages: { children: { id: string; name: string }[] }[] }; dispatch(ops: unknown[], label: string): { ok: boolean } } }
const names = (page: Page) =>
  page.evaluate(() => (window as unknown as { __maquetteStore: Store }).__maquetteStore.getState().doc.pages[0]!.children.map((c) => c.name))
/** Modification faite par l'utilisateur (sans groupe). */
const userRename = (page: Page, id: string, name: string) =>
  page.evaluate(([i, n]) => (window as unknown as { __maquetteStore: Store }).__maquetteStore.getState().dispatch([{ op: 'update', id: i, set: { name: n } }], 'Renommer').ok, [id, name])

async function start(s: EngineSetup) {
  const { app, page } = await launch([s.file], s.env)
  await expect(page.getByTestId('canvas')).toBeVisible()
  return { app, page }
}

async function openChat(page: Page) {
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+l')
  await expect(page.getByTestId('chat-panel')).toBeVisible()
}

async function say(page: Page, text: string, answer = 'Fait.') {
  const field = page.getByRole('textbox', { name: 'Message to Claude' })
  await field.fill(text)
  await field.press('Enter')
  await expect(page.getByTestId('chat-panel').locator('.chat-assistant').last()).toHaveText(answer, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
}

/** Raccourci envoyé au canevas (le focus quitte la saisie du chat). */
async function key(page: Page, combo: string) {
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press(combo)
}

test.describe('annuler une réponse de Claude', () => {
  test('un Ctrl+Z retire tous les calques de la réponse, Ctrl+Y les remet ; bouton Undo', async () => {
    const s = engineSetup()
    const { app, page } = await start(s)
    try {
      await openChat(page)
      await say(page, 'Ajoute trois calques')
      expect(await names(page)).toEqual(expect.arrayContaining(CALQUES))

      await key(page, 'Control+z')
      expect((await names(page)).filter((n) => CALQUES.includes(n))).toEqual([])
      await key(page, 'Control+y')
      expect(await names(page)).toEqual(expect.arrayContaining(CALQUES))

      // Bouton sous la réponse : au sommet, un clic annule sans question.
      const undo = page.getByTestId('chat-reply-undo')
      await expect(undo).toHaveCount(1)
      await undo.click()
      expect((await names(page)).filter((n) => CALQUES.includes(n))).toEqual([])
      await expect(undo).toHaveCount(0)
      // Refaite, la réponse retrouve son bouton.
      await key(page, 'Control+y')
      await expect(undo).toHaveCount(1)

      // Modification de l'utilisateur après la réponse : question ; Cancel ne change rien.
      expect(await userRename(page, 'rBleu1', 'Renommé')).toBe(true)
      await undo.click()
      const dialog = page.getByRole('dialog', { name: 'Undo this reply?' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Changes made after it will be undone too.')
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
      expect(await names(page)).toEqual(expect.arrayContaining([...CALQUES, 'Renommé']))

      // Undo : la modification de l'utilisateur et toute la réponse partent.
      await undo.click()
      await page.getByRole('dialog', { name: 'Undo this reply?' }).getByRole('button', { name: 'Undo' }).click()
      const after = await names(page)
      expect(after.filter((n) => CALQUES.includes(n))).toEqual([])
      expect(after).toContain('rBleu1')
      await expect(undo).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('deux réponses : chacune son bouton et son pas d’annulation', async () => {
    const s = engineSetup()
    const { app, page } = await start(s)
    try {
      await openChat(page)
      await say(page, 'Ajoute trois calques')
      await say(page, 'Ajoute un bouton')
      await expect(page.getByTestId('chat-reply-undo')).toHaveCount(2)
      await key(page, 'Control+z')
      const n = await names(page)
      expect(n).not.toContain('Bouton')
      expect(n).toEqual(expect.arrayContaining(CALQUES))
      await expect(page.getByTestId('chat-reply-undo')).toHaveCount(1)
    } finally {
      await app.close()
    }
  })

  test('Claude Code extérieur : ses modifications successives s’annulent d’un coup, jusqu’à une modification de l’utilisateur', async () => {
    const s = engineSetup()
    const { app, page } = await start(s)
    const exe = await app.evaluate(() => process.execPath)
    const transport = new StdioClientTransport({
      command: exe,
      args: [resolve('out/main/relay.js')],
      env: { ...(process.env as Record<string, string>), ...s.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    const c = new Client({ name: 'e2e', version: '1.0.0' })
    await c.connect(transport)
    const create = (name: string) =>
      c.callTool({ name: 'appliquer', arguments: { libelle: name, operations: [{ op: 'create', parent: 'pScene', node: { type: 'shape', shape: 'rectangle', name, x: 0, y: 500, width: 20, height: 20 } }] } })
    try {
      await create('Ext 1')
      await create('Ext 2')
      expect(await userRename(page, 'rVert1', 'Vert renommé')).toBe(true)
      await create('Ext 3')
      await create('Ext 4')
      await key(page, 'Control+z')
      let n = await names(page)
      expect(n).toEqual(expect.arrayContaining(['Ext 1', 'Ext 2', 'Vert renommé']))
      expect(n).not.toContain('Ext 3')
      expect(n).not.toContain('Ext 4')
      await key(page, 'Control+z')
      await key(page, 'Control+z')
      n = await names(page)
      expect(n).not.toContain('Ext 1')
      expect(n).not.toContain('Ext 2')
      expect(n).toContain('rVert1')
    } finally {
      await c.close()
      await app.close()
    }
  })
})

test.describe('historique de versions', () => {
  async function openVersions(page: Page) {
    await key(page, 'Control+Alt+h')
    const modal = page.getByTestId('floating-versions')
    await expect(modal).toBeVisible()
    return modal
  }

  test('version automatique avant la réponse, restaurée puis annulée par Ctrl+Z', async () => {
    const s = engineSetup()
    const { app, page } = await start(s)
    try {
      await openChat(page)
      await say(page, 'Bonjour', 'Bonjour !')
      // Une réponse sans modification ne crée pas de version.
      let modal = await openVersions(page)
      await expect(modal).toContainText('No versions yet.')
      await page.keyboard.press('Escape')
      await expect(modal).toHaveCount(0)

      await say(page, 'Ajoute trois calques')
      modal = await openVersions(page)
      const rows = modal.getByTestId('version-row')
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('Before Claude: Ajoute trois calques')
      await expect(rows.first()).toContainText('Auto')
      await expect(rows.first()).toContainText('Just now')
      // Aperçu rendu par la fenêtre cachée de l'export.
      await expect(modal.getByTestId('versions-preview').locator('img')).toBeVisible({ timeout: 15_000 })

      await modal.getByRole('button', { name: 'Restore' }).click()
      await expect(modal).toHaveCount(0)
      expect((await names(page)).filter((n) => CALQUES.includes(n))).toEqual([])
      await expect(page.getByTestId('file-dirty')).toBeVisible()

      await key(page, 'Control+z')
      expect(await names(page)).toEqual(expect.arrayContaining(CALQUES))

      // « Before restore » a été prise avant de restaurer.
      modal = await openVersions(page)
      await expect(modal.getByTestId('version-row')).toHaveCount(2)
      await expect(modal.getByTestId('version-row').first()).toContainText('Before restore')
    } finally {
      await app.close()
    }
  })

  test('version nommée : créée, renommée, supprimée', async () => {
    const s = engineSetup()
    const { app, page } = await start(s)
    try {
      const modal = await openVersions(page)
      await modal.getByRole('button', { name: 'Save version…' }).click()
      const field = modal.getByRole('textbox', { name: 'Version name' })
      await expect(field).toHaveValue(/^Version /)
      await field.fill('Ma version')
      await field.press('Enter')
      const row = modal.getByTestId('version-row')
      await expect(row).toHaveCount(1)
      await expect(row).toContainText('Ma version')
      await expect(row).not.toContainText('Auto')
      await expect(row).toHaveAttribute('aria-selected', 'true')

      await modal.getByRole('button', { name: 'Rename' }).click()
      const rename = modal.getByRole('textbox', { name: 'New name' })
      await rename.fill('Version renommée')
      await rename.press('Enter')
      await expect(row).toContainText('Version renommée')

      await modal.getByRole('button', { name: 'Delete' }).click()
      const dialog = page.getByRole('dialog', { name: 'Delete the version “Version renommée”?' })
      await dialog.getByRole('button', { name: 'Delete' }).click()
      await expect(row).toHaveCount(0)
      await expect(modal).toContainText('No versions yet.')
    } finally {
      await app.close()
    }
  })

  test('document jamais enregistré : pas de versions', async () => {
    const { app, page } = await launch()
    try {
      const modal = await openVersions(page)
      await expect(modal).toContainText('Save the file to keep versions.')
    } finally {
      await app.close()
    }
  })
})
