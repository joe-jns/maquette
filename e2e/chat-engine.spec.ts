import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatApi, ChatEvent, ChatItem, ChatSend } from '../src/shared/chat'
import { engineSetup as setup, type EngineSetup as Setup } from './chat'
import { launch } from './launch'

/**
 * Moteur du chat (processus principal) avec un faux `claude` : on parle à window.maquette.chat
 * directement, sans le panneau.
 */

const NOT_INSTALLED = 'Claude Code n’est pas installé sur cet ordinateur (commande « claude » introuvable). Installez-le puis réessayez.'

async function start(s: Setup) {
  const { app, page } = await launch([s.file], s.env)
  await expect(page.getByTestId('canvas')).toBeVisible()
  // Collecte des événements du chat dans la page.
  await page.evaluate(() => {
    const w = window as unknown as { __chat: ChatEvent[]; maquette: { chat: { onEvent(cb: (e: ChatEvent) => void): () => void } } }
    w.__chat = []
    w.maquette.chat.onEvent((e) => w.__chat.push(e))
  })
  return { app, page }
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __chat: ChatEvent[] }).__chat)
const clear = (page: Page) => page.evaluate(() => void ((window as unknown as { __chat: ChatEvent[] }).__chat.length = 0))
const open = (page: Page, path: string | null) => page.evaluate((p) => (window as unknown as { maquette: { chat: { open(p: string | null): Promise<ChatItem[]> } } }).maquette.chat.open(p), path)
const send = (page: Page, text: string, images: ChatSend['images'] = []) =>
  page.evaluate((m) => (window as unknown as { maquette: { chat: { send(m: ChatSend): void } } }).maquette.chat.send(m), { text, context: '', images })
const stop = (page: Page) => page.evaluate(() => (window as unknown as { maquette: { chat: { stop(): void } } }).maquette.chat.stop())
const permission = (page: Page, requestId: string, decision: string) =>
  page.evaluate(([r, d]) => (window as unknown as { maquette: { chat: { permission(r: string, d: string): void } } }).maquette.chat.permission(r!, d!), [requestId, decision])

/** Éléments à jour (dernier état de chaque id), dans l'ordre d'apparition. */
async function items(page: Page): Promise<ChatItem[]> {
  const byId = new Map<string, ChatItem>()
  for (const e of await events(page)) if (e.type === 'item') byId.set(e.item.id, e.item)
  return [...byId.values()]
}
/** Attend la fin du tour : le dernier événement busy est false. */
async function idle(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.type === 'busy').at(-1), { timeout: 15_000 }).toEqual({ type: 'busy', busy: false })
}
const texts = async (page: Page, kind: ChatItem['kind']) => (await items(page)).filter((i) => i.kind === kind).map((i) => ('text' in i ? i.text : ''))
const readLog = (s: Setup) => (existsSync(s.log) ? readFileSync(s.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const launches = (s: Setup) => readLog(s).filter((e) => e.argv) as { argv: string[]; cwd: string }[]
const thumbFiles = (s: Setup) => {
  try {
    return readdirSync(join(s.userData, 'chat-images'))
  } catch {
    return []
  }
}
const reset = (page: Page) => page.evaluate(() => (window as unknown as { maquette: { chat: { reset(): Promise<unknown> } } }).maquette.chat.reset())
const conversations = (page: Page) => page.evaluate(() => (window as unknown as { maquette: { chat: ChatApi } }).maquette.chat.conversations())
const removeConversation = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { maquette: { chat: ChatApi } }).maquette.chat.remove(i), id)

test.describe('chat : moteur', () => {
  test('texte au fil de l’eau, puis remplacé par le message complet ; dossier et arguments de claude', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      expect(await open(page, s.file)).toEqual([])
      await send(page, 'bonjour')
      await idle(page)
      const evs = await events(page)
      const deltas = evs.filter((e) => e.type === 'delta')
      expect(deltas.map((d) => d.type === 'delta' && d.text)).toEqual(['Bon', 'jour !'])
      const assistant = (await items(page)).find((i) => i.kind === 'assistant')
      expect(assistant).toEqual({ kind: 'assistant', id: deltas[0]!.type === 'delta' ? deltas[0]!.id : '', text: 'Bonjour !' })
      expect(evs[0]).toMatchObject({ type: 'item', item: { kind: 'user', text: 'bonjour', images: 0 } })
      expect(evs.filter((e) => e.type === 'busy')).toEqual([{ type: 'busy', busy: true }, { type: 'busy', busy: false }])

      const [run] = launches(s)
      expect(run!.cwd).toBe(s.dir)
      const args = run!.argv.join(' ')
      expect(args).toContain('--permission-mode default')
      expect(args).toContain('--permission-prompt-tool stdio')
      expect(args).toContain('--allowedTools mcp__maquette')
      expect(args).not.toContain('--resume')
      const prompt = readFileSync(run!.argv[run!.argv.indexOf('--append-system-prompt-file') + 1]!, 'utf8')
      expect(prompt).toContain('scène chat.maquette')
      // Consigne permanente, taste-skill éteint par défaut : méthode de Pen.
      expect(prompt).toContain('decide the look from the request itself')
      expect(prompt).not.toContain('mandatory taste-skill method')

      // Le processus reste vivant entre les tours.
      await clear(page)
      await send(page, 'encore')
      await idle(page)
      expect(await texts(page, 'assistant')).toEqual(['Reçu.'])
      expect(launches(s)).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  test('dessine : appliquer passe par le relais, le rectangle apparaît dans le document', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'dessine un rectangle')
      await idle(page)
      const tool = (await events(page)).filter((e) => e.type === 'item' && e.item.kind === 'tool').map((e) => e.type === 'item' && e.item)
      expect(tool).toMatchObject([
        { kind: 'tool', id: 'toolu_dessin', name: 'appliquer', summary: '1 opération', status: 'running' },
        { kind: 'tool', id: 'toolu_dessin', name: 'appliquer', summary: '1 opération', status: 'done' },
      ])
      // Le détail : les opérations envoyées (JSON indenté) et la réponse de Maquette.
      const done = tool[1] as Extract<ChatItem, { kind: 'tool' }>
      expect(JSON.parse(done.input!)).toMatchObject([{ op: 'create', node: { name: 'Rectangle du chat' } }])
      expect(done.input).toContain('\n  {')
      expect(done.output).toBeTruthy()
      expect(await texts(page, 'assistant')).toEqual(['Fait.'])
      const names = await page.evaluate(() =>
        (window as unknown as { __maquetteStore: { getState(): { doc: { pages: { children: { name: string }[] }[] } } } }).__maquetteStore.getState().doc.pages[0]!.children.map((c) => c.name),
      )
      expect(names).toContain('Rectangle du chat')
    } finally {
      await app.close()
    }
  })

  test('permission : autoriser, refuser, puis « toujours » ne redemande plus', async () => {
    const s = setup()
    const { app, page } = await start(s)
    const asking = async () => {
      await expect.poll(async () => (await items(page)).some((i) => i.kind === 'permission' && i.status === 'asking'), { timeout: 10_000 }).toBe(true)
      return (await items(page)).find((i) => i.kind === 'permission' && i.status === 'asking') as Extract<ChatItem, { kind: 'permission' }>
    }
    try {
      await open(page, s.file)
      await send(page, 'lance une commande')
      const p1 = await asking()
      expect(p1).toMatchObject({ tool: 'Bash', summary: 'echo hi' })
      await permission(page, p1.requestId, 'allow')
      await idle(page)
      expect((await items(page)).find((i) => i.id === p1.id)).toMatchObject({ status: 'allowed' })
      expect(await texts(page, 'assistant')).toEqual(['autorisé'])

      await clear(page)
      await send(page, 'commande encore')
      const p2 = await asking()
      await permission(page, p2.requestId, 'deny')
      await idle(page)
      expect(await texts(page, 'assistant')).toEqual(['refusé'])
      expect((await items(page)).find((i) => i.kind === 'tool')).toMatchObject({ status: 'error' })

      await clear(page)
      await send(page, 'commande 3')
      const p3 = await asking()
      await permission(page, p3.requestId, 'always')
      await idle(page)
      await clear(page)
      await send(page, 'commande 4')
      await idle(page)
      expect((await items(page)).filter((i) => i.kind === 'permission')).toEqual([])
      expect(await texts(page, 'assistant')).toEqual(['autorisé'])
      // L'historique garde les décisions.
      const saved = await open(page, s.file)
      expect(saved.filter((i) => i.kind === 'permission').map((i) => i.kind === 'permission' && i.status)).toEqual(['allowed', 'denied', 'allowed'])
    } finally {
      await app.close()
    }
  })

  test('Stop : le tour s’arrête aussitôt, sans erreur, et la conversation continue', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'un texte long')
      await expect.poll(async () => (await events(page)).filter((e) => e.type === 'delta').length).toBeGreaterThan(2)
      const t0 = Date.now()
      await stop(page)
      await idle(page)
      expect(Date.now() - t0).toBeLessThan(2000)
      expect(await texts(page, 'error')).toEqual([])
      expect(readLog(s).some((e) => e.line?.type === 'control_request' && e.line.request.subtype === 'interrupt')).toBe(true)

      await clear(page)
      await send(page, 'bonjour')
      await idle(page)
      expect(await texts(page, 'assistant')).toEqual(['Bonjour !'])
      expect(launches(s)).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  test('images jointes : envoyées avant le texte, comptées dans le message affiché', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      await send(page, 'regarde ces images', [{ mediaType: 'image/png', data: png }, { mediaType: 'image/png', data: png }])
      await idle(page)
      expect((await items(page))[0]).toMatchObject({ kind: 'user', text: 'regarde ces images', images: 2 })
      expect(await texts(page, 'assistant')).toEqual(['2 image(s) reçue(s)'])
      const sent = readLog(s).find((e) => e.line?.type === 'user').line.message.content
      expect(sent.map((b: { type: string }) => b.type)).toEqual(['image', 'image', 'text'])
      expect(readLog(s).find((e) => e.images)?.images).toEqual([70, 70])

      // Vignettes : l'élément revient avec elles, enregistrées une fois (même image), gardées dans l'historique.
      await expect.poll(async () => ((await items(page))[0] as Extract<ChatItem, { kind: 'user' }>).thumbs?.length).toBe(2)
      const [thumb] = ((await items(page))[0] as Extract<ChatItem, { kind: 'user' }>).thumbs!
      expect(thumb).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), width: 1, height: 1 })
      expect(thumbFiles(s)).toEqual([`${thumb!.hash}.jpg`])
      const saved = await open(page, s.file)
      expect(saved[0]).toMatchObject({ kind: 'user', images: 2, thumbs: [thumb, thumb] })
      // Servie par maquette-chat://, et rien d'autre que les vignettes.
      const fetched = await app.evaluate(async ({ net }, h) => {
        const get = (url: string) => net.fetch(url).then((r) => `${r.status} ${r.headers.get('content-type') ?? ''}`.trim(), (e: Error) => `erreur ${e.message}`)
        return [
          await get(`maquette-chat://img/${h}.jpg`),
          await get('maquette-chat://img/..%2F..%2Fchats.json'),
          await get('maquette-chat://img/../chats.json'),
          await get(`maquette-chat://autre/${h}.jpg`),
          await get(`maquette-chat://img/${'0'.repeat(64)}.jpg`),
        ]
      }, thumb!.hash)
      expect(fetched).toEqual(['200 image/jpeg', '404 text/plain;charset=UTF-8', '404 text/plain;charset=UTF-8', '404 text/plain;charset=UTF-8', '404 text/plain;charset=UTF-8'])
      // La fenêtre l'affiche (CSP img-src).
      const size = await page.evaluate(
        (h) =>
          new Promise<number>((done) => {
            const img = new Image()
            img.onload = () => done(img.naturalWidth)
            img.onerror = () => done(-1)
            img.src = `maquette-chat://img/${h}.jpg`
          }),
        thumb!.hash,
      )
      expect(size).toBe(1)
    } finally {
      await app.close()
    }
  })

  test('Claude regarde : capture avec entrée, texte et image du résultat ; vignettes gardées par « nouvelle conversation », effacées avec la conversation', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'regarde le hero')
      await idle(page)
      expect(await texts(page, 'assistant')).toEqual(['Le hero est bien centré.'])
      await expect.poll(async () => ((await items(page)).find((i) => i.kind === 'tool') as Extract<ChatItem, { kind: 'tool' }>).images?.length).toBe(1)
      const tool = (await items(page)).find((i) => i.kind === 'tool') as Extract<ChatItem, { kind: 'tool' }>
      expect(tool).toMatchObject({ name: 'capture', status: 'done', output: 'capture de Hero (1440×600)', images: [{ width: 240, height: 100 }] })
      expect(JSON.parse(tool.input!)).toEqual({ id: 'fHero1', largeur: 800 })
      expect(thumbFiles(s)).toEqual([`${tool.images![0]!.hash}.jpg`])
      expect((await open(page, s.file)).find((i) => i.kind === 'tool')).toEqual(tool)

      const { current } = await conversations(page)
      await reset(page)
      // L'ancienne conversation reste : ses vignettes aussi.
      expect(thumbFiles(s)).toEqual([`${tool.images![0]!.hash}.jpg`])
      expect(await open(page, s.file)).toEqual([])
      await removeConversation(page, current!)
      expect(thumbFiles(s)).toEqual([])
    } finally {
      await app.close()
    }
  })

  test('reprise après relance de l’app : historique, puis --resume', async () => {
    const s = setup()
    let first = await start(s)
    const saved = () => {
      try {
        return JSON.parse(readFileSync(join(s.userData, 'chats.json'), 'utf8'))[s.file].conversations[0] as { sessionId: string | null; items: ChatItem[] }
      } catch {
        return null
      }
    }
    try {
      await open(first.page, s.file)
      await send(first.page, 'bonjour')
      await idle(first.page)
      await expect.poll(() => saved()?.items.length).toBe(2)
    } finally {
      await first.app.close()
    }

    const sessionId = saved()!.sessionId
    expect(sessionId).toBeTruthy()
    first = await start(s)
    try {
      const history = await open(first.page, s.file)
      expect(history.map((i) => i.kind)).toEqual(['user', 'assistant'])
      expect(history[1]).toMatchObject({ text: 'Bonjour !' })
      await send(first.page, 'bonjour')
      await idle(first.page)
      const runs = launches(s)
      expect(runs).toHaveLength(2)
      expect(runs[1]!.argv.slice(runs[1]!.argv.indexOf('--resume'), runs[1]!.argv.indexOf('--resume') + 2)).toEqual(['--resume', sessionId])
    } finally {
      await first.app.close()
    }
  })

  test('processus mort en plein tour : erreur, puis le message suivant reprend avec --resume', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'meurs')
      await idle(page)
      expect((await texts(page, 'error'))[0]).toContain('s’est arrêté pendant la réponse')
      await clear(page)
      await send(page, 'bonjour')
      await idle(page)
      expect(await texts(page, 'assistant')).toEqual(['Bonjour !'])
      const runs = launches(s)
      expect(runs).toHaveLength(2)
      expect(runs[1]!.argv).toContain('--resume')
      // Le texte partiel du tour interrompu est gardé dans l'historique.
      expect((await open(page, s.file)).some((i) => i.kind === 'assistant' && i.text === 'Je pars…')).toBe(true)
    } finally {
      await app.close()
    }
  })

  test('conversation introuvable : on repart sans --resume et on le dit', async () => {
    const s = setup()
    writeFileSync(join(s.userData, 'chats.json'), JSON.stringify({ [s.file]: { sessionId: 'introuvable', items: [] } }))
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'bonjour')
      await idle(page)
      expect(await texts(page, 'error')).toEqual(['La conversation précédente n’a pas pu être reprise ; nouvelle conversation.'])
      expect(await texts(page, 'assistant')).toEqual(['Bonjour !'])
      const runs = launches(s)
      expect(runs.map((r) => r.argv.includes('--resume'))).toEqual([true, false])
    } finally {
      await app.close()
    }
  })

  test('changer de document arrête claude ; sans titre ne reprend pas un ancien lancement', async () => {
    const s = setup()
    const { app, page } = await start(s)
    try {
      await open(page, s.file)
      await send(page, 'commande')
      await expect.poll(async () => (await items(page)).some((i) => i.kind === 'permission')).toBe(true)
      expect(await open(page, null)).toEqual([])
      await idle(page)
      expect((await items(page)).find((i) => i.kind === 'permission')).toMatchObject({ status: 'denied' })
      await send(page, 'bonjour')
      await idle(page)
      expect(launches(s)).toHaveLength(2)
      expect(launches(s)[1]!.argv).not.toContain('--resume')
    } finally {
      await app.close()
    }
    // Relance : la conversation « sans titre » est oubliée, celle du fichier est gardée.
    const again = await start(s)
    try {
      expect(await open(again.page, null)).toEqual([])
      expect((await open(again.page, s.file)).length).toBeGreaterThan(0)
    } finally {
      await again.app.close()
    }
  })

  for (const [what, cmd] of [
    ['exécutable absent', JSON.stringify(['claude-introuvable-maquette.exe'])],
    ['cmd : commande inconnue (9009)', JSON.stringify(['cmd.exe', '/d', '/s', '/c', 'claude-introuvable-maquette'])],
  ] as const) {
    test(`claude introuvable (${what}) : message clair, la saisie reste possible`, async () => {
      const s = setup({ MAQUETTE_CLAUDE_CMD: cmd })
      const { app, page } = await start(s)
      try {
        await open(page, s.file)
        await send(page, 'bonjour')
        await idle(page)
        expect(await texts(page, 'error')).toEqual([NOT_INSTALLED])
      } finally {
        await app.close()
      }
    })
  }
})
