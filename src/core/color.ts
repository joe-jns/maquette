import type { Color } from './types'

/** Les 148 couleurs nommées de CSS (CSS Color Module Level 4). */
const NAMED =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 ' +
  'black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 ' +
  'chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff ' +
  'darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 ' +
  'darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
  'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f ' +
  'darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 ' +
  'dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
  'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 ' +
  'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
  'lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 ' +
  'lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
  'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 ' +
  'mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 ' +
  'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 ' +
  'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 ' +
  'oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa ' +
  'palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f ' +
  'pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
  'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee ' +
  'sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
  'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 ' +
  'violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32'

const NAMED_COLORS = new Map(NAMED.split(' ').map((pair) => pair.split(':') as [string, string]))

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')

function fromChannels(r: number, g: number, b: number, a: number): string {
  const rgb = `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return (a >= 1 ? rgb : rgb + hex2(a * 255)).toUpperCase()
}

/** Toute couleur CSS lisible → `#RRGGBB` (ou `#RRGGBBAA` si transparente), sinon null. */
export function normalizeColor(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (s === 'transparent') return '#00000000'
  const named = NAMED_COLORS.get(s)
  if (named) return `#${named}`.toUpperCase()

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (hex) {
    const h = hex[1]!
    const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
    return `#${full.endsWith('ff') && full.length === 8 ? full.slice(0, 6) : full}`.toUpperCase()
  }

  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(s)
  if (!fn) return null
  const parts = fn[1]!.split(/\s*[,/]\s*|\s+/).filter(Boolean)
  if (parts.length !== 3 && parts.length !== 4) return null
  const channels = parts.slice(0, 3).map(Number)
  if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null
  let alpha = 1
  if (parts[3] !== undefined) {
    const raw = parts[3]
    alpha = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw)
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null
  }
  return fromChannels(channels[0]!, channels[1]!, channels[2]!, alpha)
}

/** Valeur de couleur d'un élément : chaîne normalisée, référence de style gardée, sinon null. */
export function normalizeColorValue(c: unknown): Color | null {
  if (typeof c === 'string') return normalizeColor(c)
  if (c !== null && typeof c === 'object' && typeof (c as { style?: unknown }).style === 'string') {
    return { style: (c as { style: string }).style }
  }
  return null
}
