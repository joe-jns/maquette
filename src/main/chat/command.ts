/** Ligne de commande de `claude` pour le chat : arguments, et lancement par cmd sous Windows. */

export interface ClaudeLaunch {
  /** Fichier de la configuration MCP (serveur `maquette`). */
  mcpConfig: string
  /** Fichier de la consigne système ajoutée à celle de Claude Code. */
  promptFile: string
  resume: string | null
}

export function claudeArgs(launch: ClaudeLaunch): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    // Demandes d'accord sur stdout/stdin ; mode « default » même si l'utilisateur a choisi bypassPermissions.
    '--permission-prompt-tool', 'stdio',
    '--permission-mode', 'default',
    '--mcp-config', launch.mcpConfig,
    // Tous les outils du serveur maquette : dessiner ne demande rien.
    '--allowedTools', 'mcp__maquette',
    '--append-system-prompt-file', launch.promptFile,
    ...(launch.resume ? ['--resume', launch.resume] : []),
  ]
}

/** Argument pour cmd : entre guillemets s'il contient un espace ou un caractère spécial de cmd. */
export function cmdQuote(arg: string): string {
  return /[\s"&|<>^%()!,;=]/.test(arg) || arg === '' ? `"${arg.replace(/"/g, '""')}"` : arg
}

export interface Command { file: string; args: string[]; verbatim: boolean }

/**
 * Commande à lancer. `override` (MAQUETTE_CLAUDE_CMD, tableau JSON [exe, ...args]) remplace `claude`
 * pour les tests. Sous Windows, `claude` peut être un .exe ou un .cmd (installation npm) : on passe par
 * cmd, avec la ligne entière entre guillemets (/s les retire) et chaque argument protégé.
 */
export function claudeCommand(args: string[], platform: NodeJS.Platform, override?: string): Command {
  if (override) {
    const parsed: unknown = JSON.parse(override)
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((p) => typeof p === 'string')) throw new Error('MAQUETTE_CLAUDE_CMD : tableau JSON [exe, ...args] attendu')
    const [file, ...pre] = parsed as string[]
    return { file: file!, args: [...pre, ...args], verbatim: false }
  }
  if (platform === 'win32') {
    const line = ['claude', ...args].map(cmdQuote).join(' ')
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], verbatim: true }
  }
  return { file: 'claude', args, verbatim: false }
}

/** Codes de « commande introuvable » : 9009 pour cmd, 127 pour un shell. */
export const NOT_FOUND_CODES = [9009, 127]
/** Message de cmd quand la commande n'existe pas (français ou anglais). */
export const NOT_FOUND_TEXT = /n.est pas reconnu|is not recognized|command not found/i
