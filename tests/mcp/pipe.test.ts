import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, type Socket } from 'node:net'
import { createLineReader, ensureToken, MAX_LINE_BYTES, pipePath, readToken, tokenPath, tokensEqual } from '../../src/mcp/pipe'
import { connectBridge } from '../../src/mcp/pipeClient'
import { startBridge } from '../../src/main/mcpBridge'

const testPipe = () => (process.platform === 'win32' ? `\\\\.\\pipe\\maquette-test-${Math.random().toString(36).slice(2)}` : join(tmpdir(), `mq-${Math.random().toString(36).slice(2)}.sock`))

describe('canal MCP', () => {
  it('jeton créé une fois, relu ensuite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jeton '))
    expect(await readToken(dir)).toBeNull()
    const t = await ensureToken(dir)
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(await ensureToken(dir)).toBe(t)
    expect((await readFile(tokenPath(dir), 'utf8')).trim()).toBe(t)
  })

  it('appel aller-retour, appels concurrents', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async (tool, args) => ({ text: `${tool}:${JSON.stringify(args)}` }) })
    const client = await connectBridge({ path, token: 'a'.repeat(64) })
    const [r1, r2] = await Promise.all([client.call('un', { a: 1 }), client.call('deux', {})])
    expect(r1.text).toBe('un:{"a":1}')
    expect(r2.text).toBe('deux:{}')
    client.close()
    await bridge.close()
  })

  it('mauvais jeton refusé, aucun outil exécuté', async () => {
    const path = testPipe()
    let calls = 0
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async () => { calls++; return { text: '' } } })
    await expect(connectBridge({ path, token: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'JETON_REFUSE' })
    expect(calls).toBe(0)
    await bridge.close()
  })

  it('app fermée : erreur APP_FERMEE', async () => {
    await expect(connectBridge({ path: testPipe(), token: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'APP_FERMEE' })
  })

  it('une erreur de l’outil est renvoyée, la connexion reste utilisable', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: 'a'.repeat(64), handle: async (tool) => { if (tool === 'boum') throw new Error('raté'); return { text: 'ok' } } })
    const client = await connectBridge({ path, token: 'a'.repeat(64) })
    await expect(client.call('boum', {})).rejects.toThrow('raté')
    expect((await client.call('autre', {})).text).toBe('ok')
    client.close()
    await bridge.close()
  })
})

describe('canal MCP : robustesse', () => {
  const T = 'a'.repeat(64)
  const ok = async () => ({ text: 'ok' })

  /** Socket brut connecté au pont, qui accumule ce qu'il reçoit. */
  const raw = (path: string) =>
    new Promise<{ s: Socket; got: () => string; closed: Promise<void> }>((resolve, reject) => {
      const s = connect(path)
      let buf = ''
      s.on('data', (d) => (buf += d.toString('utf8')))
      const closed = new Promise<void>((r) => s.on('close', () => r()))
      s.on('error', () => undefined)
      s.once('connect', () => resolve({ s, got: () => buf, closed }))
      s.once('error', reject)
    })
  const waitFor = async (cond: () => boolean, ms = 2000) => {
    const end = Date.now() + ms
    while (!cond()) {
      if (Date.now() > end) throw new Error('attente dépassée')
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  it('pipePath : variable d’environnement, sinon nom nettoyé', () => {
    const saved = process.env.MAQUETTE_PIPE
    try {
      process.env.MAQUETTE_PIPE = 'mon-pipe'
      expect(pipePath('x')).toBe('mon-pipe')
      delete process.env.MAQUETTE_PIPE
      const p = pipePath('Jean Dupont/é')
      expect(p).toContain('maquette-Jean_Dupont__')
      if (process.platform === 'win32') expect(p.startsWith('\\\\.\\pipe\\')).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.MAQUETTE_PIPE
      else process.env.MAQUETTE_PIPE = saved
    }
  })

  it('comparaison des jetons : longueur différente = refus', () => {
    expect(tokensEqual(T, T)).toBe(true)
    expect(tokensEqual(T.slice(1), T)).toBe(false)
    expect(tokensEqual(`${T}a`, T)).toBe(false)
    expect(tokensEqual(42, T)).toBe(false)
    expect(tokensEqual('b'.repeat(64), T)).toBe(false)
  })

  it('lecteur de lignes : lignes coupées, plusieurs lignes par paquet, accents coupés', () => {
    const lines: string[] = []
    const read = createLineReader((l) => lines.push(l), () => lines.push('DEBORDEMENT'), 100)
    const e = Buffer.from('é', 'utf8')
    read(Buffer.from('ab'))
    read(Buffer.from('c\nde\nf'))
    read(e.subarray(0, 1))
    read(Buffer.concat([e.subarray(1), Buffer.from('\n\n')]))
    expect(lines).toEqual(['abc', 'de', 'fé', ''])
    read(Buffer.alloc(101, 0x61))
    expect(lines.at(-1)).toBe('DEBORDEMENT')
  })

  it('protocole : requête coupée en octets, deux requêtes dans un paquet', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: async (tool) => ({ text: tool }) })
    const c = await raw(path)
    const msg = `{"hello":"${T}"}\n{"id":1,"tool":"un","args":{}}\n{"id":2,"tool":"deux"}\n`
    for (const ch of msg.slice(0, 80)) c.s.write(ch)
    c.s.write(msg.slice(80))
    await waitFor(() => c.got().split('\n').length >= 4)
    const replies = c.got().trim().split('\n').map((l) => JSON.parse(l))
    expect(replies[0]).toEqual({ ok: true })
    expect(replies.slice(1).sort((a, b) => a.id - b.id)).toEqual([
      { id: 1, result: { text: 'un' } },
      { id: 2, result: { text: 'deux' } },
    ])
    c.s.destroy()
    await bridge.close()
  })

  it('ligne trop longue : connexion fermée', async () => {
    const path = testPipe()
    let calls = 0
    const bridge = await startBridge({ path, token: T, maxLineBytes: 1000, handle: async () => { calls++; return { text: '' } } })
    const c = await raw(path)
    c.s.write(`{"hello":"${T}"}\n`)
    c.s.write('x'.repeat(2000))
    await c.closed
    expect(calls).toBe(0)
    await bridge.close()
  })

  it('limite par défaut de 20 Mo : une ligne plus longue ferme la connexion', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: ok })
    const c = await raw(path)
    c.s.write(`{"hello":"${T}"}\n`)
    c.s.write(Buffer.alloc(MAX_LINE_BYTES + 1024, 0x61))
    await c.closed
    await bridge.close()
  }, 20000)

  it('pas de hello dans le délai : connexion fermée', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: ok, authTimeoutMs: 50 })
    const c = await raw(path)
    await c.closed
    expect(c.got()).toBe('')
    await bridge.close()
  })

  it('requête avant hello : refusée, aucun outil exécuté', async () => {
    const path = testPipe()
    let calls = 0
    const bridge = await startBridge({ path, token: T, handle: async () => { calls++; return { text: '' } } })
    const c = await raw(path)
    c.s.write(`{"id":1,"tool":"x","args":{}}\n{"hello":"${T}"}\n{"id":2,"tool":"x","args":{}}\n`)
    await c.closed
    expect(JSON.parse(c.got().trim().split('\n')[0])).toEqual({ error: 'jeton invalide' })
    expect(calls).toBe(0)
    await bridge.close()
  })

  it('jeton de longueur différente : JETON_REFUSE', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: ok })
    await expect(connectBridge({ path, token: 'a'.repeat(63) })).rejects.toMatchObject({ code: 'JETON_REFUSE' })
    await expect(connectBridge({ path, token: '' })).rejects.toMatchObject({ code: 'JETON_REFUSE' })
    await bridge.close()
  })

  it('réponse de 5 Mo (image base64) transmise intacte', async () => {
    const path = testPipe()
    const data = Buffer.alloc(5 * 1024 * 1024, 7).toString('base64')
    const bridge = await startBridge({ path, token: T, handle: async () => ({ text: 'capture', image: { data, mimeType: 'image/jpeg' } }) })
    const client = await connectBridge({ path, token: T })
    const r = await client.call('capturer', {})
    expect(r.image?.data.length).toBe(data.length)
    expect(r.image?.data === data).toBe(true)
    client.close()
    await bridge.close()
  })

  it('outil trop lent : DELAI, la connexion reste utilisable', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: (tool) => (tool === 'lent' ? new Promise(() => undefined) : ok()) })
    const client = await connectBridge({ path, token: T, timeoutMs: 100 })
    await expect(client.call('lent', {})).rejects.toMatchObject({ code: 'DELAI' })
    expect((await client.call('vite', {})).text).toBe('ok')
    client.close()
    await bridge.close()
  })

  it('fermeture du pont : connexions ouvertes détruites, appels en cours en APP_FERMEE', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: () => new Promise(() => undefined) })
    const client = await connectBridge({ path, token: T })
    const pending = client.call('attend', {})
    await new Promise((r) => setTimeout(r, 20))
    expect(client.isOpen()).toBe(true)
    await bridge.close()
    await expect(pending).rejects.toMatchObject({ code: 'APP_FERMEE' })
    expect(client.isOpen()).toBe(false)
    await expect(client.call('apres', {})).rejects.toMatchObject({ code: 'APP_FERMEE' })
    await expect(connectBridge({ path, token: T })).rejects.toMatchObject({ code: 'APP_FERMEE' })
  })

  it('client fermé : appels suivants refusés', async () => {
    const path = testPipe()
    const bridge = await startBridge({ path, token: T, handle: ok })
    for (let i = 0; i < 20; i++) {
      const client = await connectBridge({ path, token: T })
      await client.call('x', {})
      client.close()
      await expect(client.call('x', {})).rejects.toMatchObject({ code: 'APP_FERMEE' })
    }
    await bridge.close()
  })

  it('le pipe est réutilisable après fermeture', async () => {
    const path = testPipe()
    const b1 = await startBridge({ path, token: T, handle: ok })
    await b1.close()
    const b2 = await startBridge({ path, token: T, handle: ok })
    const client = await connectBridge({ path, token: T })
    expect((await client.call('x', {})).text).toBe('ok')
    client.close()
    await b2.close()
  })
})
