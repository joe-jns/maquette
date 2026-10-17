/**
 * Markdown simple des réponses de Claude, sans dépendance : découpé en blocs et en morceaux de texte,
 * que React affiche ensuite comme du texte (jamais de HTML injecté).
 * Gras **, italique * ou _, `code`, blocs ```, listes - et 1., titres #, liens http(s).
 */

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'strong'; children: Inline[] }
  | { t: 'em'; children: Inline[] }
  | { t: 'link'; href: string; children: Inline[] }

export type Block =
  | { t: 'p'; lines: Inline[][] }
  | { t: 'heading'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'list'; ordered: boolean; start: number; items: Inline[][] }

const FENCE = /^\s*```/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', lines: para.map(parseInline) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE.test(line)) {
      flush()
      // Bloc de code : jusqu'à la clôture (ou la fin, pendant que le texte arrive).
      const code: string[] = []
      while (++i < lines.length && !FENCE.test(lines[i]!)) code.push(lines[i]!)
      blocks.push({ t: 'code', text: code.join('\n') })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ t: 'heading', children: parseInline(heading[1]!) })
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      flush()
      const ordered = !!numbered
      const text = bullet ? bullet[1]! : numbered![2]!
      const last = blocks[blocks.length - 1]
      if (last?.t === 'list' && last.ordered === ordered) last.items.push(parseInline(text))
      else blocks.push({ t: 'list', ordered, start: numbered ? Number(numbered[1]) : 1, items: [parseInline(text)] })
      continue
    }
    // Ligne indentée juste après un élément de liste : la suite de cet élément.
    const last = blocks[blocks.length - 1]
    if (!para.length && last?.t === 'list' && /^\s{2,}\S/.test(line) && lines[i - 1]?.trim()) {
      const item = last.items[last.items.length - 1]!
      item.push({ t: 'text', text: ' ' }, ...parseInline(line.trim()))
      continue
    }
    para.push(line)
  }
  flush()
  return blocks
}

/** Fin d'URL : la ponctuation finale reste dans la phrase. */
function trimUrl(url: string): string {
  let end = url.length
  while (end > 0 && /[.,;:!?)\]'"»]/.test(url[end - 1]!)) {
    // Une parenthèse fermante qui en referme une ouverte dans l'URL lui appartient.
    if (url[end - 1] === ')' && (url.slice(0, end).match(/\(/g)?.length ?? 0) >= (url.slice(0, end).match(/\)/g)?.length ?? 0)) break
    end--
  }
  return url.slice(0, end)
}

const isHttp = (href: string) => /^https?:\/\//i.test(href)

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const push = (node: Inline) => {
    if (text) out.push({ t: 'text', text })
    text = ''
    out.push(node)
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const ch = src[i]!
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        push({ t: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const mark = rest.slice(0, 2)
      const end = src.indexOf(mark, i + 2)
      if (end > i + 2) {
        push({ t: 'strong', children: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch) {
      // _ au milieu d'un mot (nom_de_fichier) n'ouvre pas d'italique.
      const opens = ch === '*' || !/\w/.test(src[i - 1] ?? '')
      const end = src.indexOf(ch, i + 1)
      if (opens && end > i + 1 && src[end - 1] !== ' ' && (ch === '*' || !/\w/.test(src[end + 1] ?? ''))) {
        push({ t: 'em', children: parseInline(src.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
      if (m && isHttp(m[2]!)) {
        push({ t: 'link', href: m[2]!, children: parseInline(m[1]!) })
        i += m[0].length
        continue
      }
    }
    if ((ch === 'h' || ch === 'H') && !/\w/.test(src[i - 1] ?? '')) {
      const m = /^https?:\/\/[^\s<>]+/i.exec(rest)
      if (m) {
        const href = trimUrl(m[0])
        push({ t: 'link', href, children: [{ t: 'text', text: href }] })
        i += href.length
        continue
      }
    }
    text += ch
    i++
  }
  if (text) out.push({ t: 'text', text })
  return out
}
