import { describe, it, expect, vi } from 'vitest'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({ app: {}, ipcMain: {} }))
const { readDesignFile, resolveDesignFile } = await import('../../src/main/design')

const ROOT = resolve(__dirname, '../../vendor/design')

describe('fichiers de design (vendor/design)', () => {
  it('lit un guide et les styles', async () => {
    expect(await readDesignFile(ROOT, 'maquette/methode.md')).toContain('appliquer')
    expect(JSON.parse((await readDesignFile(ROOT, 'styles.json'))!).styles.length).toBeGreaterThanOrEqual(26)
    expect(await readDesignFile(ROOT, 'better/better-typography/SKILL.md')).toContain('typography')
  })

  it('refuse toute sortie du dossier et tout fichier inattendu', async () => {
    for (const bad of [
      '../taste-skill/SKILL.md',
      '..\\taste-skill\\SKILL.md',
      'maquette/../../package.json',
      '/etc/passwd',
      'C:/Windows/win.ini',
      'C:\\Windows\\win.ini',
      '\\\\serveur\\partage\\x.md',
      '.hidden.md',
      'maquette/.x.md',
      'maquette//methode.md',
      'maquette/methode.md/',
      'maquette/methode.txt',
      'maquette/methode',
      '',
      'a'.repeat(300) + '.md',
    ]) {
      expect(resolveDesignFile(ROOT, bad), bad).toBeNull()
      expect(await readDesignFile(ROOT, bad), bad).toBeNull()
    }
  })

  it('un fichier absent donne null', async () => {
    expect(resolveDesignFile(ROOT, 'maquette/absent.md')).toBe(join(ROOT, 'maquette', 'absent.md'))
    expect(await readDesignFile(ROOT, 'maquette/absent.md')).toBeNull()
  })
})
