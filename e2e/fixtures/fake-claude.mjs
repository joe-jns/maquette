// Faux `claude -p --input-format stream-json --output-format stream-json` pour les tests du chat.
// Rejoue un scénario selon le texte reçu ; journal (argv, cwd, lignes reçues) dans FAKE_CLAUDE_LOG.
import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const log = (entry) => {
  if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify(entry)}\n`)
}
log({ argv, cwd: process.cwd() })

const resume = flag('--resume')
if (resume === 'introuvable') {
  process.stderr.write(`No conversation found with session ID: ${resume}\n`)
  out({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: resume, errors: [`No conversation found with session ID: ${resume}`] })
  process.exit(1)
}
const sessionId = resume ?? randomUUID()
let initDone = false

function out(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Réponses de l'app aux control_request, attendues par request_id. */
const waiting = new Map()
let interrupted = null

function text(msgId, index, chunks) {
  out({ type: 'stream_event', event: { type: 'message_start', message: { id: msgId, role: 'assistant', content: [] } }, parent_tool_use_id: null })
  out({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, parent_tool_use_id: null, api_message_id: msgId })
  for (const c of chunks) out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: c } }, parent_tool_use_id: null, api_message_id: msgId })
  out({ type: 'assistant', message: { id: msgId, role: 'assistant', content: [{ type: 'text', text: chunks.join('') }] }, parent_tool_use_id: null })
}
const result = (body = 'ok', isError = false) => out({ type: 'result', subtype: isError ? 'error_during_execution' : 'success', is_error: isError, result: body, session_id: sessionId })
const toolUse = (id, name, input) => out({ type: 'assistant', message: { id: `msg_${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] }, parent_tool_use_id: null })
const toolResult = (id, isError) => out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: '', is_error: isError }] }, parent_tool_use_id: null })

/** Client MCP minimal (JSON-RPC sur stdio) vers le relais déclaré dans --mcp-config. */
async function mcp() {
  const cfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers.maquette
  const relay = spawn(cfg.command, cfg.args, { env: { ...process.env, ...cfg.env }, stdio: ['pipe', 'pipe', 'inherit'] })
  const replies = new Map()
  let buf = ''
  relay.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i))
      buf = buf.slice(i + 1)
      replies.get(msg.id)?.(msg)
    }
  })
  let id = 0
  const call = (method, params) =>
    new Promise((resolve) => {
      const n = ++id
      replies.set(n, resolve)
      relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`)
    })
  await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '1' } })
  relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const tool = async (name, args) => {
    const r = (await call('tools/call', { name, arguments: args })).result
    return { text: r.content.find((c) => c.type === 'text')?.text ?? '', isError: !!r.isError }
  }
  return { tool, close: () => relay.kill() }
}

async function turn(content) {
  const said = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const images = content.filter((b) => b.type === 'image').length
  if (!initDone) {
    initDone = true
    out({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), tools: [] })
  }
  const m = `msg_${randomUUID().slice(0, 8)}`
  if (/bonjour/i.test(said)) {
    text(m, 0, ['Bon', 'jour !'])
    result('Bonjour !')
  } else if (/dessine/i.test(said)) {
    const client = await mcp()
    try {
      const doc = JSON.parse((await client.tool('lire_document', {})).text)
      const input = { libelle: 'rectangle', operations: [{ op: 'create', parent: doc.pages[0].id, node: { type: 'shape', shape: 'rectangle', name: 'Rectangle du chat', x: 10, y: 10, width: 80, height: 60, fills: ['#DC2626'] } }] }
      toolUse('toolu_dessin', 'mcp__maquette__appliquer', input)
      const r = await client.tool('appliquer', input)
      log({ appliquer: r })
      toolResult('toolu_dessin', r.isError)
    } finally {
      client.close()
    }
    text(m, 0, ['Fait.'])
    result('Fait.')
  } else if (/commande/i.test(said)) {
    toolUse('toolu_bash', 'Bash', { command: 'echo hi' })
    const requestId = `perm-${randomUUID().slice(0, 8)}`
    const answer = new Promise((resolve) => waiting.set(requestId, resolve))
    out({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'echo hi' } } })
    const reply = await answer
    const allowed = reply.response.response.behavior === 'allow'
    toolResult('toolu_bash', !allowed)
    text(m, 0, [allowed ? 'autorisé' : 'refusé'])
    result(allowed ? 'autorisé' : 'refusé')
  } else if (/long/i.test(said)) {
    out({ type: 'stream_event', event: { type: 'message_start', message: { id: m } }, parent_tool_use_id: null })
    const stop = new Promise((resolve) => (interrupted = resolve))
    for (let i = 0; i < 100; i++) {
      const id = await Promise.race([stop, sleep(100).then(() => null)])
      if (id) {
        interrupted = null
        out({ type: 'control_response', response: { subtype: 'success', request_id: id } })
        result('', false)
        return
      }
      out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `${i} ` } }, parent_tool_use_id: null, api_message_id: m })
    }
    result('fini')
  } else if (/image/i.test(said)) {
    text(m, 0, [`${images} image(s) reçue(s)`])
    result('images')
  } else if (/meurs/i.test(said)) {
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Je pars…' } }, parent_tool_use_id: null, api_message_id: m })
    await sleep(50)
    process.exit(3)
  } else {
    text(m, 0, ['Reçu.'])
    result('Reçu.')
  }
}

// Les tours s'enchaînent : un message arrivé pendant un tour attend la fin du précédent.
let queue = Promise.resolve()
let input = ''
process.stdin.on('data', (d) => {
  input += d
  let i
  while ((i = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, i)
    input = input.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    log({ line: msg.type === 'user' ? { ...msg, message: { ...msg.message, content: msg.message.content.map((b) => (b.type === 'image' ? { type: 'image', bytes: b.source.data.length } : b)) } } : msg })
    if (msg.type === 'control_response') waiting.get(msg.response.request_id)?.(msg)
    else if (msg.type === 'control_request' && msg.request.subtype === 'interrupt') interrupted?.(msg.request_id)
    else if (msg.type === 'user') queue = queue.then(() => turn(msg.message.content))
  }
})
process.stdin.on('end', () => queue.then(() => process.exit(0)))
