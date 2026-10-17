import type { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import type { DialogRequest } from '../shared/ipc'
import { askWindow } from './askDialog'
import { currentEditorWindow } from './openFiles'

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

const OK = [{ label: 'OK', kind: 'primary' as const }]

/** Menu « Connecter à Claude Code… » : montre la commande, demande, l'exécute, dit le résultat. */
export async function connectClaudeCode(win: BrowserWindow | undefined): Promise<void> {
  const target = win ?? currentEditorWindow()
  // Sans fenêtre, personne pour répondre : rien n'est lancé.
  if (!target) {
    console.warn('Connecter à Claude Code : aucune fenêtre pour poser la question, abandon.')
    return
  }
  const box = (request: DialogRequest) => askWindow(target, request)
  const args = addArgs(process.execPath, join(__dirname, 'relay.js'))

  const existing = await claude(['mcp', 'get', NAME])
  // 9009 : code de cmd pour « commande introuvable » (message traduit selon la langue de Windows).
  if (existing.code === 9009 || existing.code === 127 || /ENOENT/.test(existing.out)) {
    await box({ title: 'Claude Code introuvable', message: 'Claude Code n’est pas installé sur cet ordinateur (commande « claude » introuvable).', detail: 'Installez Claude Code, puis recommencez.', buttons: OK, cancelIndex: 0, defaultIndex: 0 })
    return
  }
  const already = existing.code === 0
  const response = await box({
    title: 'Connecter à Claude Code',
    message: already
      ? 'Maquette est déjà connectée à Claude Code. Remplacer la connexion par celle de cette installation ?'
      : 'Connecter Maquette à Claude Code ? Claude pourra lire et modifier le document ouvert.',
    detail: 'Commande lancée :',
    code: displayCommand(args),
    buttons: [{ label: 'Annuler' }, { label: already ? 'Remplacer' : 'Connecter', kind: 'primary' }],
    defaultIndex: 1,
    cancelIndex: 0,
  })
  if (response !== 1) return

  if (already) await claude(['mcp', 'remove', '--scope', 'user', NAME])
  const result = await claude(args)
  await box(
    result.code === 0
      ? { title: 'Connecté', message: 'Maquette est connectée à Claude Code.', detail: 'Ouvrez une nouvelle session Claude Code : les outils de Maquette y seront disponibles tant que l’app est ouverte.', buttons: OK, cancelIndex: 0, defaultIndex: 0 }
      : {
          title: 'Connexion impossible',
          message: already ? 'Claude Code a refusé la nouvelle connexion (l’ancienne a été retirée).' : 'Claude Code a refusé la connexion.',
          code: result.out || `Code de sortie ${result.code}`,
          buttons: OK,
          cancelIndex: 0,
          defaultIndex: 0,
        },
  )
}
