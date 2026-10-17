/**
 * Générateur de scènes de charge pour le banc d'essai (bench/scale.spec.ts).
 *
 * - « site » : des pages de site réalistes posées côte à côte (planches de 1 440 px), chacune faite
 *   de sections (héros en mise en page libre, grilles de cartes, bandeaux de chiffres, pied de page)
 *   en mise en page automatique imbriquée sur 4-5 niveaux : planche > section > grille > carte > ligne.
 *   Textes en polices système (Arial, Georgia, Verdana), rectangles, ellipses, ombres et contours.
 * - « plat » : N rectangles côte à côte posés directement sur la page (aucune imbrication, aucune
 *   mise en page automatique) pour isoler le coût de l'imbrication.
 *
 * Éléments repères (identifiants fixes) pour les mesures d'interaction :
 *   bShape — petit rectangle libre dans le héros de la première planche (clic, glisser) ;
 *   bText  — titre du héros de la première planche (édition de texte).
 *
 * Utilisé par scale.spec.ts, qui valide chaque scène avec le vrai parseur (parseDocument) et l'écrit
 * dans bench/.scenes (ignoré par git). Aucune dépendance : importable aussi en Node (--experimental-strip-types).
 */

type Json = Record<string, unknown>

export type SceneKind = 'site' | 'plat'

const FONTS = ['Arial', 'Georgia', 'Verdana']
const PALETTE = ['#0F172A', '#1E293B', '#334155', '#F8FAFC', '#E2E8F0', '#C2410C', '#2563EB', '#16A34A', '#FDE68A', '#FBCFE8']
const LOREM =
  'Nous concevons des sites rapides et lisibles pour les commerces de quartier, avec un accompagnement humain du premier appel à la mise en ligne.'

const base = { visible: true, locked: false, opacity: 1, position: 'flow' }

/** Générateur déterministe (pas de Math.random : deux exécutions donnent la même scène). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export interface Scene { doc: Json; count: number; targets: { shape: string; text: string } }

export function makeScene(n: number, kind: SceneKind): Scene {
  return kind === 'plat' ? flat(n) : site(n)
}

function flat(n: number): Scene {
  const perRow = 100
  const children: Json[] = []
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 'bShape' : `r${i.toString(36)}`
    children.push({
      ...base, id, type: 'shape', name: `Rectangle ${i + 1}`, shape: 'rectangle',
      x: (i % perRow) * 50, y: Math.floor(i / perRow) * 50, width: 40, height: 40,
      fills: [PALETTE[i % PALETTE.length]], radius: 4, shadows: [],
    })
  }
  // Un texte libre pour la mesure d'édition (compté dans N : le dernier rectangle est remplacé).
  if (n > 0) {
    children[n - 1] = {
      ...base, id: 'bText', type: 'text', name: 'Texte', x: -400, y: 0, width: { mode: 'hug' }, height: { mode: 'hug' },
      content: 'Titre repère', fontFamily: 'Arial', fontWeight: 700, fontStyle: 'normal', fontSize: 32, lineHeight: 40,
      letterSpacing: 0, textAlign: 'left', color: '#0F172A', textSizing: 'auto',
    }
  }
  return { doc: wrap(children), count: n, targets: { shape: 'bShape', text: 'bText' } }
}

function site(n: number): Scene {
  const rand = rng(n)
  let left = n
  let seq = 0
  const nextId = (p: string) => `${p}${(seq++).toString(36)}`
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!

  /** Réserve un élément ; faux quand le budget est épuisé. */
  const take = () => (left > 0 ? (left--, true) : false)

  const text = (content: string, size: number, opts: Json = {}): Json => ({
    ...base, id: nextId('t'), type: 'text', name: content.slice(0, 24), content,
    width: { mode: 'hug' }, height: { mode: 'hug' }, textSizing: 'auto',
    fontFamily: pick(FONTS), fontWeight: size >= 24 ? 700 : 400, fontStyle: 'normal', fontSize: size,
    lineHeight: Math.round(size * 1.4), letterSpacing: 0, textAlign: 'left', color: '#0F172A', ...opts,
  })
  const para = (content: string, size: number): Json =>
    text(content, size, { width: { mode: 'fill' }, height: { mode: 'hug' }, textSizing: 'auto-height', color: '#334155' })
  const shape = (s: 'rectangle' | 'ellipse', opts: Json): Json => ({
    ...base, id: nextId(s === 'ellipse' ? 'e' : 'r'), type: 'shape', name: s === 'ellipse' ? 'Ellipse' : 'Rectangle', shape: s,
    fills: [pick(PALETTE)], radius: s === 'rectangle' ? 8 : 0, shadows: [], ...opts,
  })
  const auto = (dir: 'row' | 'column', opts: Json & { layout?: Json } = {}): Json => {
    const { layout, ...rest } = opts
    return {
      ...base, id: nextId('f'), type: 'frame', name: dir === 'row' ? 'Ligne' : 'Colonne', children: [] as Json[],
      width: { mode: 'hug' }, height: { mode: 'hug' },
      layout: { mode: 'auto', direction: dir, gap: 16, padding: [0, 0, 0, 0], justify: 'start', align: 'start', wrap: false, reverseZ: false, ...layout },
      fills: [], radius: 0, shadows: [], clip: false, ...rest,
    }
  }
  const add = (parent: Json, child: Json) => (parent.children as Json[]).push(child)
  const shadow = { x: 0, y: 8, blur: 24, spread: -4, color: '#0F172A22', inset: false }

  /** Héros en mise en page libre : fond, formes décoratives, titre, sous-titre, bouton. */
  const hero = (first: boolean): Json | null => {
    if (!take()) return null
    const f: Json = {
      ...base, id: nextId('f'), type: 'frame', name: 'Héros', children: [] as Json[], width: { mode: 'fill' }, height: 560,
      layout: { mode: 'free' }, fills: ['#0F172A'], radius: 0, shadows: [], clip: true,
    }
    const free = (node: Json, x: number, y: number) => add(f, { ...node, x, y })
    if (take()) free(shape('ellipse', { name: 'Halo', width: 520, height: 520, fills: ['#2563EB33'] }), 900, -120)
    if (take()) free(shape('ellipse', { name: 'Pastille', width: 160, height: 160, fills: ['#C2410C'] }), 1180, 360)
    if (take()) free({ ...shape('rectangle', { name: 'Carte flottante', width: 120, height: 80, fills: ['#FDE68A'], shadows: [shadow] }), ...(first ? { id: 'bShape' } : {}) }, 980, 300)
    if (take()) free({ ...text('Votre commerce mérite un vrai site', 56, { color: '#F8FAFC' }), ...(first ? { id: 'bText' } : {}) }, 120, 140)
    if (take()) free(text('Conçu, hébergé et suivi pour vous. Sans jargon.', 20, { color: '#CBD5E1' }), 120, 240)
    if (take()) {
      const btn = auto('row', { name: 'Bouton', fills: ['#C2410C'], radius: 999, layout: { padding: [14, 28, 14, 28] } })
      if (take()) add(btn, text('Demander une démo', 16, { color: '#FFFFFF', fontWeight: 600 }))
      free(btn, 120, 320)
    }
    return f
  }

  /** Section de cartes : titre, intro, grille avec retour à la ligne de cartes (image, titre, texte, étiquettes). */
  const cards = (count: number): Json | null => {
    if (!take()) return null
    const s = auto('column', { name: 'Section cartes', width: { mode: 'fill' }, fills: ['#F8FAFC'], layout: { padding: [80, 120, 80, 120], gap: 32 } })
    if (take()) add(s, text('Ce que nous faisons', 40))
    if (take()) add(s, para(LOREM, 18))
    if (!take()) return s
    const grid = auto('row', { name: 'Grille', width: { mode: 'fill' }, layout: { gap: 24, wrap: true, rowGap: 24 } })
    add(s, grid)
    for (let i = 0; i < count && left > 0; i++) {
      if (!take()) break
      const card = auto('column', {
        name: 'Carte', width: 376, fills: ['#FFFFFF'], radius: 16, clip: true, layout: { padding: [0, 0, 20, 0], gap: 12 },
        shadows: i % 2 === 0 ? [shadow] : [],
        ...(i % 3 === 0 ? { stroke: { color: '#E2E8F0', width: 1, align: 'inside' } } : {}),
      })
      add(grid, card)
      if (take()) add(card, shape('rectangle', { name: 'Image', width: { mode: 'fill' }, height: 180, radius: 0 }))
      if (take()) add(card, text(`Offre ${i + 1}`, 22, { width: { mode: 'hug' } }))
      if (take()) add(card, para(LOREM.slice(0, 90 + (i % 4) * 10), 15))
      if (!take()) continue
      const tags = auto('row', { name: 'Étiquettes', layout: { gap: 8, align: 'center', padding: [0, 20, 0, 20] } })
      add(card, tags)
      for (let k = 0; k < 2; k++) {
        if (take()) add(tags, shape('ellipse', { width: 8, height: 8 }))
        if (take()) add(tags, text(['Rapide', 'Local', 'Suivi', 'SEO'][(i + k) % 4]!, 13, { color: '#64748B' }))
      }
    }
    return s
  }

  /** Bandeau de chiffres : une ligne de colonnes (chiffre + libellé), contour en pointillé simulé. */
  const stats = (): Json | null => {
    if (!take()) return null
    const s = auto('row', { name: 'Chiffres', width: { mode: 'fill' }, fills: ['#FFFFFF'], layout: { padding: [56, 120, 56, 120], gap: 48, justify: 'space-between' } })
    for (let i = 0; i < 4; i++) {
      if (!take()) break
      const col = auto('column', { name: 'Chiffre', layout: { gap: 4 } })
      add(s, col)
      if (take()) add(col, text(`${(i + 1) * 120}+`, 44, { color: '#C2410C' }))
      if (take()) add(col, text('clients accompagnés', 15, { color: '#64748B' }))
    }
    return s
  }

  /** Pied de page : colonnes de liens. */
  const footer = (): Json | null => {
    if (!take()) return null
    const s = auto('row', { name: 'Pied de page', width: { mode: 'fill' }, fills: ['#0F172A'], layout: { padding: [64, 120, 64, 120], gap: 80 } })
    for (let c = 0; c < 4; c++) {
      if (!take()) break
      const col = auto('column', { name: 'Colonne', layout: { gap: 10 } })
      add(s, col)
      for (let l = 0; l < 5; l++) if (take()) add(col, text(`Lien ${c + 1}.${l + 1}`, 14, { color: '#CBD5E1' }))
    }
    return s
  }

  const boards: Json[] = []
  let b = 0
  while (left > 0) {
    if (!take()) break
    const board = auto('column', {
      name: `Page ${b + 1}`, width: 1440, fills: ['#FFFFFF'], layout: { gap: 0 }, x: (b % 10) * 1540, y: Math.floor(b / 10) * 4200,
    })
    const sections = [hero(b === 0), cards(6), stats(), cards(9), footer()]
    for (const s of sections) if (s) add(board, s)
    boards.push(board)
    b++
  }
  return { doc: wrap(boards), count: n - left, targets: { shape: 'bShape', text: 'bText' } }
}

function wrap(children: Json[]): Json {
  return { format: 'maquette', version: 1, styles: { colors: [], text: [] }, pages: [{ id: 'pBench', name: 'Charge', children }] }
}

/** Nombre d'éléments et profondeur maximale (pour vérifier le générateur). */
export function stats(doc: Json): { nodes: number; depth: number } {
  let nodes = 0
  let depth = 0
  const visit = (list: Json[], d: number) => {
    for (const n of list) {
      nodes++
      depth = Math.max(depth, d)
      if (Array.isArray(n.children)) visit(n.children as Json[], d + 1)
    }
  }
  for (const p of doc.pages as Json[]) visit(p.children as Json[], 1)
  return { nodes, depth }
}
