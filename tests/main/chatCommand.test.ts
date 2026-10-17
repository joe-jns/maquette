import { describe, it, expect } from 'vitest'
import { claudeArgs, claudeCommand, cmdQuote } from '../../src/main/chat/command'

const launch = { mcpConfig: 'C:\\Users\\Jean Dupont\\AppData\\Roaming\\maquette\\chat-mcp.json', promptFile: 'C:\\x\\consigne.txt', resume: null }

describe('commande claude du chat', () => {
  it('arguments : stream-json, accords par stdio, mode default, outils maquette autorisés', () => {
    const args = claudeArgs(launch)
    expect(args.slice(0, 5)).toEqual(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json'])
    expect(args.join(' ')).toContain('--permission-prompt-tool stdio --permission-mode default')
    expect(args.join(' ')).toContain('--allowedTools mcp__maquette')
    expect(args).not.toContain('--resume')
    expect(claudeArgs({ ...launch, resume: 'abc' }).slice(-2)).toEqual(['--resume', 'abc'])
  })

  it('Windows : par cmd, ligne entière entre guillemets, chemins avec espaces protégés', () => {
    const cmd = claudeCommand(['--mcp-config', launch.mcpConfig, '-p'], 'win32')
    expect(cmd.file).toBe('cmd.exe')
    expect(cmd.verbatim).toBe(true)
    expect(cmd.args).toEqual(['/d', '/s', '/c', `"claude --mcp-config "${launch.mcpConfig}" -p"`])
    expect(cmdQuote('a&b')).toBe('"a&b"')
    expect(cmdQuote('plain')).toBe('plain')
  })

  it('ailleurs : claude directement ; MAQUETTE_CLAUDE_CMD le remplace (tests)', () => {
    expect(claudeCommand(['-p'], 'linux')).toEqual({ file: 'claude', args: ['-p'], verbatim: false })
    expect(claudeCommand(['-p'], 'win32', '["node","C:\\\\fake.mjs"]')).toEqual({ file: 'node', args: ['C:\\fake.mjs', '-p'], verbatim: false })
    expect(() => claudeCommand([], 'win32', '"node"')).toThrow()
  })
})
