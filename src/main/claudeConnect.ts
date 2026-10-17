import { BrowserWindow, dialog } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'

const NAME = 'maquette'

/** Arguments de `claude mcp add` : Claude Code lancera le relais avec l'exécutable de Maquette en mode Node. */
export function addArgs(exe: string, relay: string): string[] {
  return ['mcp', 'add', '--scope', 'user', NAME, '-e', 'ELECTRON_RUN_AS_NODE=1', '--', exe, relay]
}

/** La commande telle qu'on la montre à l'utilisateur avant de la lancer. */
export function displayCommand(args: string[]): string {
  return ['claude', ...args.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))].join(' ')
}

interface Run { code: number; out: string }

function claude(args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    // `claude` peut être un .exe ou un .cmd (installation npm) : on passe par cmd sous Windows.
    const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', 'claude', ...args]] : ['claude', args]
    execFile(cmd, cmdArgs, { windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolve({ code, out: `${stdout}${stderr}`.trim() })
    })
  })
}

/** Menu « Connecter à Claude Code… » : montre la commande, demande, l'exécute, dit le résultat. */
export async function connectClaudeCode(win: BrowserWindow | undefined): Promise<void> {
  const box = (options: Electron.MessageBoxOptions) => (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
  const args = addArgs(process.execPath, join(__dirname, 'relay.js'))

  const existing = await claude(['mcp', 'get', NAME])
  if (existing.code !== 0 && /not recognized|introuvable|ENOENT|command not found/i.test(existing.out)) {
    await box({ type: 'error', title: 'Claude Code introuvable', message: 'Claude Code n’est pas installé sur cet ordinateur (commande « claude » introuvable).', detail: 'Installez Claude Code, puis recommencez.' })
    return
  }
  const already = existing.code === 0
  const { response } = await box({
    type: 'question',
    title: 'Connecter à Claude Code',
    message: already
      ? 'Maquette est déjà connectée à Claude Code. Remplacer la connexion par celle de cette installation ?'
      : 'Connecter Maquette à Claude Code ? Claude pourra lire et modifier le document ouvert.',
    detail: `Commande lancée :\n${displayCommand(args)}`,
    buttons: [already ? 'Remplacer' : 'Connecter', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response !== 0) return

  if (already) await claude(['mcp', 'remove', '--scope', 'user', NAME])
  const result = await claude(args)
  await box(
    result.code === 0
      ? { type: 'info', title: 'Connecté', message: 'Maquette est connectée à Claude Code.', detail: 'Ouvrez une nouvelle session Claude Code : les outils de Maquette y seront disponibles tant que l’app est ouverte.' }
      : { type: 'error', title: 'Connexion impossible', message: 'Claude Code a refusé la connexion.', detail: result.out || `Code de sortie ${result.code}` },
  )
}
