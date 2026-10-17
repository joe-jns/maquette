import { describe, it, expect } from 'vitest'
import { clip, createDecoder, interruptLine, MAX_TOOL_TEXT, permissionLine, toolInput, toolOutput, toolSummary, TRUNCATED, userLine } from '../../src/main/chat/protocol'

/** Lignes enregistrées avec Claude Code 2.1.302 (champs sans intérêt retirés). */
const L = {
  init: '{"type":"system","subtype":"init","cwd":"C:\\\\x","session_id":"a82640d3-8f1c-4734-b926-f907e7f9949a","tools":["Bash"]}',
  hook: '{"type":"system","subtype":"hook_started","hook_id":"f4","hook_name":"SessionStart:startup","session_id":"a82640d3"}',
  start1: '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-haiku-5-5","id":"msg_011Cg7k1hEKJEVAA2uyVKXwL","type":"message","role":"assistant","content":[]}},"session_id":"a8","parent_tool_use_id":null}',
  toolStart: '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01K5fsbrLuoJyhUaQTYKNT7z","name":"Bash","input":{}}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1hEKJEVAA2uyVKXwL"}',
  toolJson: '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\": \\"echo hi"}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1hEKJEVAA2uyVKXwL"}',
  toolUse: '{"type":"assistant","message":{"model":"claude-haiku-5-5","id":"msg_011Cg7k1hEKJEVAA2uyVKXwL","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_01K5fsbrLuoJyhUaQTYKNT7z","name":"Bash","input":{"command":"echo hi","description":"Run echo hi"},"caller":{"type":"direct"}}]},"parent_tool_use_id":null}',
  toolResult: '{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01K5fsbrLuoJyhUaQTYKNT7z","type":"tool_result","content":"hi","is_error":false}]},"parent_tool_use_id":null,"session_id":"a8"}',
  start2: '{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_011Cg7k1sC7AVSKnSZzkCiUt","type":"message","role":"assistant","content":[]}},"parent_tool_use_id":null}',
  thinkStart: '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1sC7AVSKnSZzkCiUt"}',
  textStart: '{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1sC7AVSKnSZzkCiUt"}',
  delta1: '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"O"}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1sC7AVSKnSZzkCiUt"}',
  delta2: '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"K"}},"parent_tool_use_id":null,"api_message_id":"msg_011Cg7k1sC7AVSKnSZzkCiUt"}',
  thinking: '{"type":"assistant","message":{"id":"msg_011Cg7k1sC7AVSKnSZzkCiUt","role":"assistant","content":[{"type":"thinking","thinking":"…","signature":"x"}]},"parent_tool_use_id":null}',
  text: '{"type":"assistant","message":{"model":"claude-haiku-5-5","id":"msg_011Cg7k1sC7AVSKnSZzkCiUt","type":"message","role":"assistant","content":[{"type":"text","text":"OK"}]},"parent_tool_use_id":null}',
  rate: '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"},"session_id":"a8"}',
  result: '{"duration_api_ms":2277,"stop_reason":"end_turn","session_id":"a82640d3-8f1c-4734-b926-f907e7f9949a","permission_denials":[],"is_error":false,"num_turns":2,"subtype":"success","result":"OK","type":"result"}',
  resumeFailed: '{"type":"result","subtype":"error_during_execution","duration_ms":0,"is_error":true,"num_turns":0,"session_id":"00000000-0000-0000-0000-000000000000","permission_denials":[],"errors":["No conversation found with session ID: 00000000-0000-0000-0000-000000000000"]}',
  permission: '{"type":"control_request","request_id":"req-7","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -rf build"},"description":"Supprime build"}}',
  controlResponse: '{"type":"control_response","response":{"subtype":"success","request_id":"stop-1"}}',
}

describe('décodage des lignes de claude', () => {
  it('session, outil lancé puis terminé, texte au fil de l’eau puis complet, fin du tour', () => {
    const decode = createDecoder()
    const all = [L.init, L.hook, L.start1, L.toolStart, L.toolJson, L.toolUse, L.toolResult, L.rate, L.start2, L.thinkStart, L.textStart, L.delta1, L.delta2, L.thinking, L.text, L.result].flatMap(decode)
    expect(all).toEqual([
      { type: 'session', sessionId: 'a82640d3-8f1c-4734-b926-f907e7f9949a' },
      { type: 'item', item: { kind: 'tool', id: 'toolu_01K5fsbrLuoJyhUaQTYKNT7z', name: 'Bash', summary: 'echo hi', input: 'echo hi', status: 'running' } },
      { type: 'item', item: { kind: 'tool', id: 'toolu_01K5fsbrLuoJyhUaQTYKNT7z', name: 'Bash', summary: 'echo hi', input: 'echo hi', output: 'hi', status: 'done' } },
      { type: 'delta', id: 'msg_011Cg7k1sC7AVSKnSZzkCiUt:1', text: 'O' },
      { type: 'delta', id: 'msg_011Cg7k1sC7AVSKnSZzkCiUt:1', text: 'K' },
      // Même id que les morceaux : le texte complet les remplace (blocs « thinking » ignorés).
      { type: 'item', item: { kind: 'assistant', id: 'msg_011Cg7k1sC7AVSKnSZzkCiUt:1', text: 'OK' } },
      { type: 'end', isError: false, text: 'OK', sessionId: 'a82640d3-8f1c-4734-b926-f907e7f9949a', resumeFailed: false },
    ])
  })

  it('sans api_message_id, message_start relie les morceaux au message', () => {
    const decode = createDecoder()
    const delta = '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Salut"}},"parent_tool_use_id":null}'
    expect([L.start2, delta].flatMap(decode)).toEqual([{ type: 'delta', id: 'msg_011Cg7k1sC7AVSKnSZzkCiUt:0', text: 'Salut' }])
  })

  it('outil en erreur', () => {
    const decode = createDecoder()
    decode(L.toolUse)
    expect(decode(L.toolResult.replace('"is_error":false', '"is_error":true'))).toEqual([
      { type: 'item', item: { kind: 'tool', id: 'toolu_01K5fsbrLuoJyhUaQTYKNT7z', name: 'Bash', summary: 'echo hi', input: 'echo hi', output: 'hi', status: 'error' } },
    ])
  })

  it('résultat en blocs : textes mis bout à bout, images à part (capture de Maquette)', () => {
    const decode = createDecoder()
    decode('{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"t1","name":"mcp__maquette__capture","input":{"id":"f1","largeur":800}}]},"parent_tool_use_id":null}')
    const result = {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 't1',
          content: [
            { type: 'text', text: 'capture de Hero' },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/AA' } },
            { type: 'text', text: '(800 px)' },
          ],
        }],
      },
      parent_tool_use_id: null,
    }
    expect(decode(JSON.stringify(result))).toEqual([{
      type: 'item',
      item: { kind: 'tool', id: 't1', name: 'capture', summary: '', input: '{\n  "id": "f1",\n  "largeur": 800\n}', output: 'capture de Hero\n(800 px)', status: 'done' },
      images: [{ mediaType: 'image/jpeg', data: '/9j/AA' }],
    }])
  })

  it('demande d’accord', () => {
    expect(createDecoder()(L.permission)).toEqual([{ type: 'permission', requestId: 'req-7', tool: 'Bash', input: { command: 'rm -rf build' }, summary: 'rm -rf build' }])
  })

  it('reprise impossible : conversation introuvable', () => {
    const [end] = createDecoder()(L.resumeFailed)
    expect(end).toMatchObject({ type: 'end', isError: true, resumeFailed: true })
  })

  it('ignore la réponse à notre arrêt, les sous-agents, le reste et les lignes illisibles', () => {
    const decode = createDecoder()
    const sub = L.text.replace('"parent_tool_use_id":null', '"parent_tool_use_id":"toolu_x"')
    expect([L.controlResponse, L.hook, L.rate, sub, 'pas du json', '[]'].flatMap(decode)).toEqual([])
  })
})

describe('résumés des outils', () => {
  it('outils de Maquette sans préfixe, nombre d’opérations', () => {
    expect(toolSummary('mcp__maquette__appliquer', { operations: [{ op: 'create' }, { op: 'update' }] })).toBe('2 opérations')
    expect(toolSummary('mcp__maquette__appliquer', { ops: [{ op: 'create' }] })).toBe('1 opération')
    expect(toolSummary('mcp__maquette__lire_document', {})).toBe('')
  })

  it('commande tronquée, chemin, adresse', () => {
    const long = `echo ${'a'.repeat(100)}`
    expect(toolSummary('Bash', { command: long })).toHaveLength(80)
    expect(toolSummary('Read', { file_path: 'C:\\x\\a.ts' })).toBe('C:\\x\\a.ts')
    expect(toolSummary('WebFetch', { url: 'https://exemple.be' })).toBe('https://exemple.be')
    expect(toolSummary('TodoWrite', { todos: [] })).toBe('')
  })
})

describe('détail des outils', () => {
  it('entrée lisible selon l’outil', () => {
    const ops = [{ op: 'create', parent: 'p1' }]
    expect(toolInput('mcp__maquette__appliquer', { libelle: 'x', operations: ops })).toBe(JSON.stringify(ops, null, 2))
    expect(toolInput('Bash', { command: 'npm run build', description: 'Build' })).toBe('npm run build')
    expect(toolInput('PowerShell', { command: 'Get-ChildItem' })).toBe('Get-ChildItem')
    expect(toolInput('Read', { file_path: 'C:\\a.ts' })).toBe('C:\\a.ts')
    expect(toolInput('Read', { file_path: 'C:\\a.ts', offset: 10, limit: 5 })).toBe('C:\\a.ts\n(à partir de la ligne 10, 5 lignes)')
    expect(toolInput('Write', { file_path: 'a.txt', content: 'salut' })).toBe('a.txt\n\nsalut')
    expect(toolInput('Edit', { file_path: 'a.ts', old_string: 'x = 1', new_string: 'x = 2' })).toBe('a.ts\n\nAncien texte :\nx = 1\n\nNouveau texte :\nx = 2')
    expect(toolInput('WebFetch', { url: 'https://exemple.be', prompt: 'Résume' })).toBe('https://exemple.be\n\nRésume')
    expect(toolInput('WebSearch', { query: 'figma auto layout' })).toBe('figma auto layout')
    expect(toolInput('mcp__maquette__lire_document', {})).toBe('')
    expect(toolInput('Glob', { pattern: '**/*.ts' })).toBe('{\n  "pattern": "**/*.ts"\n}')
  })

  it('résultat : texte seul, blocs, images au format de l’API ou du MCP, le reste ignoré', () => {
    expect(toolOutput('ok')).toEqual({ text: 'ok', images: [] })
    expect(toolOutput(undefined)).toEqual({ text: '', images: [] })
    expect(
      toolOutput([
        { type: 'text', text: 'a' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        { type: 'image', data: 'BBBB', mimeType: 'image/jpeg' },
        { type: 'image', source: { type: 'base64', media_type: 'text/plain', data: 'CCCC' } },
        { type: 'document', text: 'z' },
        'perdu',
        { type: 'text', text: 'b' },
      ]),
    ).toEqual({ text: 'a\nb', images: [{ mediaType: 'image/png', data: 'AAAA' }, { mediaType: 'image/jpeg', data: 'BBBB' }] })
  })

  it('tronqué à ~20 000 caractères par champ', () => {
    expect(clip('court')).toBe('court')
    const long = 'x'.repeat(MAX_TOOL_TEXT + 500)
    expect(clip(long)).toBe(`${'x'.repeat(MAX_TOOL_TEXT)}${TRUNCATED}`)
    expect(TRUNCATED).toContain('(tronqué)')
    expect(toolOutput(long).text).toHaveLength(MAX_TOOL_TEXT + TRUNCATED.length)
    expect(toolInput('Bash', { command: long })).toHaveLength(MAX_TOOL_TEXT + TRUNCATED.length)
  })
})

describe('lignes envoyées à claude', () => {
  it('message : images avant le texte, contexte devant le texte', () => {
    const msg = JSON.parse(userLine({ text: 'Agrandis-le', context: 'Sélection : f1 (frame « Hero »)', images: [{ mediaType: 'image/png', data: 'AAAA' }] }))
    expect(msg).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          { type: 'text', text: 'Sélection : f1 (frame « Hero »)\n\nAgrandis-le' },
        ],
      },
    })
    expect(JSON.parse(userLine({ text: 'Salut', context: '', images: [] })).message.content).toEqual([{ type: 'text', text: 'Salut' }])
  })

  it('une ligne par message, terminée par \\n', () => {
    const l = userLine({ text: 'a\nb', context: '', images: [] })
    expect(l.endsWith('\n')).toBe(true)
    expect(l.slice(0, -1)).not.toContain('\n')
  })

  it('accord, refus, arrêt', () => {
    expect(JSON.parse(permissionLine('req-7', 'allow', { command: 'ls' }))).toEqual({
      type: 'control_response',
      response: { subtype: 'success', request_id: 'req-7', response: { behavior: 'allow', updatedInput: { command: 'ls' } } },
    })
    expect(JSON.parse(permissionLine('req-7', 'deny', { command: 'ls' })).response.response).toEqual({ behavior: 'deny', message: "Refusé par l'utilisateur" })
    expect(JSON.parse(interruptLine('stop-1'))).toEqual({ type: 'control_request', request_id: 'stop-1', request: { subtype: 'interrupt' } })
  })
})
