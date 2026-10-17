import { Fragment, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from './markdown'

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>
      case 'code':
        return <code key={i}>{n.text}</code>
      case 'strong':
        return <strong key={i}>{inline(n.children)}</strong>
      case 'em':
        return <em key={i}>{inline(n.children)}</em>
      case 'link':
        // Affiché, pas cliquable : rien ne s'ouvre depuis le chat.
        return <span key={i} className="chat-link" data-tooltip={n.href}>{inline(n.children)}</span>
    }
  })
}

function block(b: Block, i: number, caret: ReactNode): ReactNode {
  switch (b.t) {
    case 'p':
      return (
        <p key={i}>
          {b.lines.map((line, k) => (
            <Fragment key={k}>
              {k > 0 && <br />}
              {inline(line)}
            </Fragment>
          ))}
          {caret}
        </p>
      )
    case 'heading':
      return <p key={i} className="chat-heading">{inline(b.children)}{caret}</p>
    case 'code':
      return <pre key={i}><code>{b.text}</code>{caret}</pre>
    case 'list': {
      const items = b.items.map((item, k) => <li key={k}>{inline(item)}{k === b.items.length - 1 && caret}</li>)
      return b.ordered ? <ol key={i} start={b.start}>{items}</ol> : <ul key={i}>{items}</ul>
    }
  }
}

/** Texte de Claude mis en forme ; `caret` s'affiche au bout du dernier bloc (réponse en cours). */
export function MessageText({ text, caret }: { text: string; caret?: ReactNode }) {
  const blocks = parseMarkdown(text)
  if (blocks.length === 0) return caret ? <p>{caret}</p> : null
  return <>{blocks.map((b, i) => block(b, i, i === blocks.length - 1 ? caret : null))}</>
}
