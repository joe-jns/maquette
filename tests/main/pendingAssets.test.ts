import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adoptPending, carryAssets, cleanPending, referencedAssets } from '../../src/main/pendingAssets'

const temp = (label: string) => mkdtempSync(join(tmpdir(), `maquette-${label}-`))

const image = (id: string, src: string) => ({ id, type: 'image', name: id, src })
const docText = (...children: unknown[]) =>
  JSON.stringify({ format: 'maquette', version: 1, pages: [{ id: 'p', name: 'Page', children: [{ id: 'f', type: 'frame', children }] }] })

async function put(dir: string, rel: string, content: string): Promise<void> {
  await mkdir(join(dir, rel, '..'), { recursive: true })
  await writeFile(join(dir, rel), content)
}

describe('images d’un document jamais enregistré', () => {
  it('liste les src « assets/… » du document, à toute profondeur, sans doublon', () => {
    const text = docText(image('a', 'assets/a.png'), image('b', 'assets/b.jpg'), image('c', 'assets/a.png'), image('d', 'https://x/y.png'))
    expect(referencedAssets(text)).toEqual(['assets/a.png', 'assets/b.jpg'])
    expect(referencedAssets('pas du json')).toEqual([])
    // Images en remplissage d'un cadre : citées elles aussi.
    expect(referencedAssets(docText({ id: 'r', type: 'shape', fills: ['#FFFFFF', { type: 'image', src: 'assets/c.webp', fit: 'cover' }] }))).toEqual(['assets/c.webp'])
  })

  it('premier enregistrement : les images citées sont recopiées à côté du fichier, avec leurs crédits ; les src restent valables', async () => {
    const pending = temp('pending')
    const target = temp('doc')
    await put(pending, 'assets/a.png', 'A')
    await put(pending, 'assets/b.jpg', 'B')
    await put(pending, 'assets/orpheline.png', 'O')
    await put(pending, 'assets/credits.json', JSON.stringify([{ file: 'assets/b.jpg', credit: 'B par X' }, { file: 'assets/orpheline.png', credit: 'O' }]))
    // Déjà présente dans le dossier du fichier : même nom = même contenu, rien n'est écrasé.
    await put(target, 'assets/a.png', 'A')

    const text = docText(image('a', 'assets/a.png'), image('b', 'assets/b.jpg'), image('m', 'assets/manquante.png'))
    expect(await carryAssets(pending, target, text)).toEqual(['assets/a.png', 'assets/b.jpg'])
    expect((await readdir(join(target, 'assets'))).sort()).toEqual(['a.png', 'b.jpg', 'credits.json'])
    expect(await readFile(join(target, 'assets', 'b.jpg'), 'utf8')).toBe('B')
    expect(JSON.parse(await readFile(join(target, 'assets', 'credits.json'), 'utf8'))).toEqual([{ file: 'assets/b.jpg', credit: 'B par X' }])

    // Même dossier (Enregistrer) : rien à faire.
    expect(await carryAssets(target, target, text)).toEqual([])
  })

  it('un src qui sort du dossier n’est jamais copié', async () => {
    const pending = temp('pending')
    const target = temp('doc')
    await put(pending, 'secret.txt', 'S')
    expect(await carryAssets(pending, target, docText(image('x', 'assets/../../secret.txt')))).toEqual([])
  })

  it('copie de secours restaurée : les images du lancement passé rejoignent celles du lancement courant', async () => {
    const root = temp('root')
    await put(root, 'ancien/assets/a.png', 'A')
    await put(root, 'courant/assets/b.png', 'B')
    await adoptPending(join(root, 'ancien'), join(root, 'courant'))
    expect((await readdir(join(root, 'courant', 'assets'))).sort()).toEqual(['a.png', 'b.png'])
    // Rien à adopter : sans erreur.
    await adoptPending(join(root, 'absent'), join(root, 'courant'))
  })

  it('nettoyage : seuls restent les dossiers à garder', async () => {
    const root = temp('root')
    for (const s of ['1', '2', '3']) await put(root, `${s}/assets/x.png`, s)
    await cleanPending(root, (s) => s !== '2')
    expect((await readdir(root)).sort()).toEqual(['1', '3'])
    await cleanPending(join(root, 'absent'), () => false)
  })
})
