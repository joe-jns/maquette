import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { posix } from 'node:path'

const { join } = posix

/** Dossiers où l'installateur de Claude Code, npm et Homebrew posent `claude`. */
export const extraDirs = (home: string): string[] => [
  join(home, '.local', 'bin'),
  join(home, '.claude', 'local'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

/** PATH complet : celui reçu, puis celui du shell de connexion, puis les dossiers habituels, sans doublon. */
export function mergePath(current: string | undefined, fromShell: string | null, home: string): string {
  const parts = [current, fromShell].flatMap((p) => (p ? p.split(':') : [])).concat(extraDirs(home))
  return [...new Set(parts.filter(Boolean))].join(':')
}

const MARK = '__MAQUETTE_PATH__'

/** PATH du shell de connexion (avec .zshrc), entre deux marques pour ignorer ce que le shell affiche. */
export function readShellPath(shell = process.env.SHELL || '/bin/zsh'): string | null {
  try {
    const out = execFileSync(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split(MARK)[1] ?? null
  } catch {
    return null
  }
}

/** macOS : une app lancée depuis le Finder n'a que le PATH minimal du système, sans `claude`. */
export function fixShellPath(): void {
  if (process.platform !== 'darwin') return
  process.env.PATH = mergePath(process.env.PATH, readShellPath(), homedir())
}
