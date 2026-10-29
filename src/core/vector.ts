/**
 * Tracés SVG des calques `vector` (attribut « d ») : lecture, contrôle et boîte englobante. Code pur.
 */

export type ViewBox = [number, number, number, number]

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/
const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g
/** Nombre de paramètres de chaque commande. */
const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

type Segment = { cmd: string; args: number[] }

/** Découpe un tracé en commandes ; null s'il est illisible (caractère inconnu, paramètres en trop ou manquants). */
function parse(d: string): Segment[] | null {
  // Seuls des commandes, nombres, espaces et virgules sont permis.
  if (!/^[\sMmLlHhVvCcSsQqTtAaZz0-9eE.,+-]*$/.test(d)) return null
  const tokens = d.match(TOKEN) ?? []
  const segments: Segment[] = []
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]!
    if (!COMMAND.test(cmd)) return null
    if (segments.length === 0 && cmd !== 'M' && cmd !== 'm') return null
    i++
    const n = ARITY[cmd.toLowerCase()]!
    const nums: number[] = []
    while (i < tokens.length && !COMMAND.test(tokens[i]!)) nums.push(Number(tokens[i++]))
    if (n === 0) {
      if (nums.length) return null
      segments.push({ cmd, args: [] })
      continue
    }
    if (nums.length === 0 || nums.length % n !== 0 || nums.some((x) => !Number.isFinite(x))) return null
    // Paramètres répétés : commandes implicites (après M, ce sont des L).
    for (let k = 0; k < nums.length; k += n) {
      const repeat = k === 0 ? cmd : cmd === 'M' ? 'L' : cmd === 'm' ? 'l' : cmd
      segments.push({ cmd: repeat, args: nums.slice(k, k + n) })
    }
  }
  return segments.length ? segments : null
}

/** Tracé SVG lisible (commence par M, commandes et paramètres valides). */
export const isValidPath = (d: string): boolean => parse(d) !== null

/**
 * Boîte englobante d'un tracé, en coordonnées du tracé : les points d'ancrage et de contrôle des
 * courbes (un peu large pour une courbe, jamais trop étroite) ; un arc compte ses rayons autour de
 * ses extrémités. null si le tracé est illisible. Une boîte plate prend 1 d'épaisseur.
 */
export function pathBounds(d: string): ViewBox | null {
  const segments = parse(d)
  if (!segments) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  for (const { cmd, args: a } of segments) {
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toLowerCase()) {
      case 'm':
        x = ox + a[0]!
        y = oy + a[1]!
        startX = x
        startY = y
        add(x, y)
        break
      case 'l':
      case 't':
        x = ox + a[0]!
        y = oy + a[1]!
        add(x, y)
        break
      case 'h':
        x = ox + a[0]!
        add(x, y)
        break
      case 'v':
        y = oy + a[0]!
        add(x, y)
        break
      case 'c':
        add(ox + a[0]!, oy + a[1]!)
        add(ox + a[2]!, oy + a[3]!)
        x = ox + a[4]!
        y = oy + a[5]!
        add(x, y)
        break
      case 's':
      case 'q':
        add(ox + a[0]!, oy + a[1]!)
        x = ox + a[2]!
        y = oy + a[3]!
        add(x, y)
        break
      case 'a': {
        const rx = Math.abs(a[0]!)
        const ry = Math.abs(a[1]!)
        const ex = ox + a[5]!
        const ey = oy + a[6]!
        // Le centre de l'ellipse est à un rayon au plus de chaque extrémité : l'arc reste entre
        // (plus grande extrémité - 2 rayons) et (plus petite + 2 rayons), extrémités comprises.
        const span = (u: number, v: number, r: number): [number, number] =>
          [Math.min(u, v, Math.max(u, v) - 2 * r), Math.max(u, v, Math.min(u, v) + 2 * r)]
        const [x0, x1] = span(x, ex, rx)
        const [y0, y1] = span(y, ey, ry)
        add(x0, y0)
        add(x1, y1)
        x = ex
        y = ey
        add(x, y)
        break
      }
      case 'z':
        x = startX
        y = startY
        break
    }
  }
  const r = (n: number) => Math.round(n * 1000) / 1000
  const w = Math.max(maxX - minX, 0)
  const h = Math.max(maxY - minY, 0)
  return [r(minX), r(minY), r(w > 0 ? w : 1), r(h > 0 ? h : 1)]
}
