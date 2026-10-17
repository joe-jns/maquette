import { describe, it, expect } from 'vitest'
import { filterEntries, gridMove, isThumbHash, relativeDate, shortFolder, sortEntries, type RecentEntry } from '../../src/shared/home'

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const now = at(2026, 10, 17, 15, 30)

describe('relativeDate', () => {
  it('moins d’une minute : à l’instant', () => {
    expect(relativeDate(now - 20_000, now)).toBe('modifié à l’instant')
    // Horloge en avance (fichier daté du futur) : pas de « il y a -3 min ».
    expect(relativeDate(now + 180_000, now)).toBe('modifié à l’instant')
  })
  it('minutes, puis heures le même jour', () => {
    expect(relativeDate(now - 12 * 60_000, now)).toBe('modifié il y a 12 min')
    expect(relativeDate(now - 59 * 60_000, now)).toBe('modifié il y a 59 min')
    expect(relativeDate(now - 2 * 3_600_000, now)).toBe('modifié il y a 2 h')
    expect(relativeDate(at(2026, 10, 17, 0, 5), now)).toBe('modifié il y a 15 h')
  })
  it('la veille : hier (même à moins de 24 h)', () => {
    expect(relativeDate(at(2026, 10, 16, 23, 0), now)).toBe('modifié hier')
    expect(relativeDate(at(2026, 10, 16, 0, 1), now)).toBe('modifié hier')
  })
  it('juste après minuit : les minutes d’abord', () => {
    expect(relativeDate(at(2026, 10, 16, 23, 50), at(2026, 10, 17, 0, 10))).toBe('modifié il y a 20 min')
  })
  it('plus ancien : la date, avec l’année si elle diffère', () => {
    expect(relativeDate(at(2026, 10, 3), now)).toBe('modifié le 3 octobre')
    expect(relativeDate(at(2026, 8, 1), now)).toBe('modifié le 1er août')
    expect(relativeDate(at(2025, 12, 24), now)).toBe('modifié le 24 décembre 2025')
  })
})

const entry = (name: string, modified: number | null, path = `C:\\d\\${name}.maquette`): RecentEntry => ({
  path, name, folder: '~\\d', modified, missing: modified === null, thumb: null,
})

describe('filterEntries', () => {
  const list = [entry('Été Studio', 1), entry('Boulangerie', 2), entry('site ETE', 3)]
  it('sans recherche : tout', () => {
    expect(filterEntries(list, '  ')).toBe(list)
  })
  it('sans accents ni majuscules, sur le nom', () => {
    expect(filterEntries(list, 'ete').map((e) => e.name)).toEqual(['Été Studio', 'site ETE'])
    expect(filterEntries(list, 'BOUL').map((e) => e.name)).toEqual(['Boulangerie'])
  })
  it('le dossier ne compte pas', () => {
    expect(filterEntries(list, 'maquette')).toEqual([])
  })
})

describe('sortEntries', () => {
  it('le plus récemment modifié d’abord, les introuvables à la fin dans l’ordre des récents', () => {
    const list = [entry('a', 100), entry('perdu1', null), entry('b', 300), entry('perdu2', null), entry('c', 200)]
    expect(sortEntries(list).map((e) => e.name)).toEqual(['b', 'c', 'a', 'perdu1', 'perdu2'])
  })
  it('à date égale : l’ordre des récents', () => {
    expect(sortEntries([entry('x', 5), entry('y', 5)]).map((e) => e.name)).toEqual(['x', 'y'])
  })
  it('ne modifie pas la liste reçue', () => {
    const list = [entry('a', 1), entry('b', 2)]
    sortEntries(list)
    expect(list.map((e) => e.name)).toEqual(['a', 'b'])
  })
})

describe('shortFolder', () => {
  const home = 'C:\\Users\\joe'
  it('le dossier personnel devient ~', () => {
    expect(shortFolder('C:\\Users\\joe\\Documents', home)).toBe('~\\Documents')
    expect(shortFolder('c:\\users\\JOE\\Sites\\A', home)).toBe('~\\Sites\\A')
    expect(shortFolder('C:\\Users\\joe', home)).toBe('~')
  })
  it('un dossier voisin au nom proche n’est pas le dossier personnel', () => {
    expect(shortFolder('C:\\Users\\joel', home)).toBe('C:\\Users\\joel')
  })
  it('profond : les deux derniers dossiers', () => {
    expect(shortFolder('C:\\Users\\joe\\Documents\\Clients\\Dupont', home)).toBe('…\\Clients\\Dupont')
    expect(shortFolder('D:\\a\\b\\c\\d', home)).toBe('…\\c\\d')
  })
  it('séparateur /', () => {
    expect(shortFolder('/home/joe/sites', '/home/joe', '/')).toBe('~/sites')
  })
})

describe('gridMove', () => {
  // 7 cartes sur 3 colonnes : 0 1 2 / 3 4 5 / 6
  it('gauche et droite, bornées', () => {
    expect(gridMove(0, 'ArrowLeft', 3, 7)).toBe(0)
    expect(gridMove(2, 'ArrowRight', 3, 7)).toBe(3)
    expect(gridMove(6, 'ArrowRight', 3, 7)).toBe(6)
  })
  it('haut et bas d’une rangée ; pas de rangée : reste', () => {
    expect(gridMove(1, 'ArrowDown', 3, 7)).toBe(4)
    expect(gridMove(4, 'ArrowDown', 3, 7)).toBe(4)
    expect(gridMove(5, 'ArrowUp', 3, 7)).toBe(2)
    expect(gridMove(1, 'ArrowUp', 3, 7)).toBe(1)
  })
  it('Début, Fin, autre touche, grille vide', () => {
    expect(gridMove(4, 'Home', 3, 7)).toBe(0)
    expect(gridMove(0, 'End', 3, 7)).toBe(6)
    expect(gridMove(4, 'a', 3, 7)).toBe(4)
    expect(gridMove(0, 'ArrowRight', 3, 0)).toBe(-1)
  })
})

describe('isThumbHash', () => {
  it('40 caractères hexadécimaux en minuscules, rien d’autre', () => {
    expect(isThumbHash('a'.repeat(40))).toBe(true)
    expect(isThumbHash('0123456789abcdef0123456789abcdef01234567')).toBe(true)
    expect(isThumbHash('A'.repeat(40))).toBe(false)
    expect(isThumbHash('a'.repeat(39))).toBe(false)
    expect(isThumbHash(`..\\${'a'.repeat(37)}`)).toBe(false)
    expect(isThumbHash(`${'a'.repeat(40)}/../x`)).toBe(false)
    expect(isThumbHash(42)).toBe(false)
  })
})
