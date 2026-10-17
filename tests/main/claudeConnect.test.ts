import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, dialog: {} }))
const { addArgs, displayCommand } = await import('../../src/main/claudeConnect')

describe('connexion à Claude Code', () => {
  it('inscrit le relais lancé par l’exécutable de Maquette en mode Node', () => {
    const exe = 'C:\\Program Files\\Maquette\\Maquette.exe'
    const relay = 'C:\\app\\out\\main\\relay.js'
    const args = addArgs(exe, relay)
    expect(args).toEqual(['mcp', 'add', '--scope', 'user', 'maquette', '-e', 'ELECTRON_RUN_AS_NODE=1', '--', exe, relay])
    expect(displayCommand(args)).toBe(`claude mcp add --scope user maquette -e ELECTRON_RUN_AS_NODE=1 -- "${exe}" ${relay}`)
  })
})
