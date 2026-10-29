import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { filterEntries, gridMove, relativeDate, sortEntries, type RecentEntry } from '../../shared/home'
import { dialogStore } from '../dialog/dialogStore'
import { confirmLeave, runCommand } from '../state/commands'
import { openDocument } from '../state/openDocument'
import { docStore } from '../state/store'
import { Icon } from '../ui/icons'
import { Menu, SEPARATOR, type MenuEntry } from '../ui/Menu'
import { homeStore, useHome } from './homeStore'
import './home.css'

/** Aperçus déjà reçus (empreinte + date de l'image) : pas de nouvel aller-retour à chaque affichage. */
const thumbs = new Map<string, string>()

function Thumb({ entry }: { entry: RecentEntry }) {
  const key = entry.thumb ? `${entry.thumb.hash}:${entry.thumb.version}` : null
  const [src, setSrc] = useState<string | null>(() => (key ? (thumbs.get(key) ?? null) : null))
  useEffect(() => {
    if (!key || !entry.thumb) return setSrc(null)
    const hit = thumbs.get(key)
    if (hit) return setSrc(hit)
    let live = true
    void window.maquette.home.thumb(entry.thumb.hash).then((url) => {
      if (url) thumbs.set(key, url)
      if (live) setSrc(url)
    })
    return () => {
      live = false
    }
  }, [key, entry.thumb])
  return (
    <div className="home-thumb" aria-hidden>
      {entry.missing ? (
        <span className="home-thumb-label">Not found</span>
      ) : src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <Icon name="page" className="home-thumb-empty" />
      )}
    </div>
  )
}

interface CardProps {
  entry: RecentEntry
  now: number
  active: boolean
  menuOpen: boolean
  onOpen(): void
  onMenu(x: number, y: number): void
  onFocus(): void
}

function Card({ entry, now, active, menuOpen, onOpen, onMenu, onFocus }: CardProps) {
  const more = useRef<HTMLButtonElement>(null)
  const state = entry.missing ? 'Moved or deleted' : entry.modified !== null ? relativeDate(entry.modified, now) : ''
  const fromButton = () => {
    const r = more.current!.getBoundingClientRect()
    onMenu(r.left, r.bottom + 4)
  }
  return (
    <li className={entry.missing ? 'home-card is-missing' : 'home-card'} data-testid="home-card" data-path={entry.path} data-menu-open={menuOpen || undefined}>
      <button
        type="button"
        className="home-card-open"
        data-home-card
        tabIndex={active ? 0 : -1}
        aria-label={`${entry.name}, ${entry.missing ? `not found (${state})` : state}, ${entry.folder}`}
        onClick={() => (entry.missing ? fromButton() : onOpen())}
        onFocus={onFocus}
        onContextMenu={(e: MouseEvent) => {
          e.preventDefault()
          onMenu(e.clientX, e.clientY)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            e.preventDefault()
            fromButton()
          }
        }}
      >
        <Thumb entry={entry} />
        <span className="home-card-meta">
          <span className="home-card-name">{entry.name}</span>
          <span className="home-card-date">{state}</span>
          <span className="home-card-folder" data-tooltip={entry.path}>{entry.folder}</span>
        </span>
      </button>
      <button
        ref={more}
        type="button"
        className="home-card-more"
        tabIndex={-1}
        aria-label={`Actions for ${entry.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-tooltip="Actions"
        onClick={fromButton}
      >
        <Icon name="more" size={16} />
      </button>
    </li>
  )
}

/** Écran d'accueil (comme le navigateur de fichiers de Figma) : récents en cartes, nouveau, ouvrir. */
export function Home() {
  const hasDocument = useHome((s) => s.hasDocument)
  const [entries, setEntries] = useState<RecentEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLUListElement>(null)
  const root = useRef<HTMLElement>(null)
  const now = Date.now()

  const refresh = useCallback(() => window.maquette.home.list().then((list) => setEntries(sortEntries(list))), [])
  // Le focus va à l'accueil (pas à la recherche, qui resterait cerclée de bleu) : les flèches mènent aux
  // cartes, une lettre tapée part dans la recherche.
  useEffect(() => {
    void refresh()
    root.current?.focus()
  }, [refresh])

  const shown = useMemo(() => filterEntries(entries ?? [], query), [entries, query])
  const current = Math.min(active, Math.max(0, shown.length - 1))

  // Les raccourcis du canevas (caché derrière) ne passent pas ; Échap revient au document.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (dialogStore.getState().queue.length) return
      const t = e.target as Element | null
      if (t?.closest?.('[data-home], .menu-layer, .notices, .dialog-backdrop')) return
      if (e.key === 'Escape') homeStore.getState().back()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const cards = () => [...(grid.current?.querySelectorAll<HTMLButtonElement>('[data-home-card]') ?? [])]
  /** Colonnes de la grille : les cartes posées sur la première rangée. */
  const columns = () => {
    const items = [...(grid.current?.children ?? [])] as HTMLElement[]
    const top = items[0]?.offsetTop
    return Math.max(1, items.filter((li) => li.offsetTop === top).length)
  }
  const focusCard = (i: number) => {
    setActive(i)
    cards()[i]?.focus()
  }

  const open = async (entry: RecentEntry) => {
    if (!(await confirmLeave())) return
    const file = await window.maquette.home.open(entry.path)
    if (!file) {
      docStore.getState().showError(`${entry.name} could not be found.`)
      void refresh()
      return
    }
    await openDocument(file)
  }

  const remove = async (path: string) => {
    await window.maquette.home.remove(path)
    await refresh()
    root.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Tout reste dans l'accueil : rien n'atteint le canevas caché.
    e.stopPropagation()
    if (dialogStore.getState().queue.length) return
    const t = e.target as HTMLElement
    if (e.key === 'Escape') {
      if (t === search.current && query) setQuery('')
      else homeStore.getState().back()
      e.preventDefault()
      return
    }
    if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      search.current?.focus()
      return
    }
    if (t === search.current || t === root.current) {
      if (['ArrowDown', 'ArrowRight'].includes(e.key) && (t === root.current || e.key === 'ArrowDown') && shown.length) {
        e.preventDefault()
        focusCard(current)
      } else if (t === root.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Taper au clavier cherche : la lettre arrive dans le champ qui prend le focus.
        search.current?.focus()
      }
      return
    }
    const at = cards().indexOf(t as HTMLButtonElement)
    if (at < 0) return
    const next = gridMove(at, e.key, columns(), shown.length)
    if (e.key === 'ArrowUp' && next === at) {
      e.preventDefault()
      search.current?.focus()
      return
    }
    if (next !== at) {
      e.preventDefault()
      focusCard(next)
    }
  }

  const menuEntry = menu ? shown.find((x) => x.path === menu.path) : undefined
  const menuItems: MenuEntry[] = menuEntry
    ? [
        { label: 'Open', disabled: menuEntry.missing, onSelect: () => void open(menuEntry) },
        { label: 'Show in Explorer', disabled: menuEntry.missing, onSelect: () => void window.maquette.home.reveal(menuEntry.path) },
        SEPARATOR,
        { label: 'Remove from recents', onSelect: () => void remove(menuEntry.path) },
      ]
    : []

  const actions = (
    <>
      <button type="button" className="home-button" onClick={() => void runCommand('open')}>
        Open…
      </button>
      <button type="button" className="home-button is-primary" onClick={() => void runCommand('new')}>
        <Icon name="plus" size={16} />
        New design
      </button>
    </>
  )

  return (
    <section ref={root} tabIndex={-1} className="home" data-home data-ui data-testid="home" aria-label="Home" onKeyDown={onKeyDown}>
      <header className="home-bar">
        <div className="home-brand">
          {hasDocument && (
            <button
              type="button"
              className="home-back"
              aria-label="Back to document"
              data-tooltip="Back to document"
              data-shortcut="Esc"
              onClick={() => homeStore.getState().back()}
            >
              <Icon name="chevronLeft" size={16} />
            </button>
          )}
          <h1 className="home-title">Maquette</h1>
        </div>
        <label className="home-search">
          <Icon name="zoom" size={16} />
          <input
            ref={search}
            type="search"
            placeholder="Search files"
            aria-label="Search files"
            value={query}
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
        </label>
        <div className="home-actions">{actions}</div>
      </header>

      <div className="home-body">
        {entries && entries.length === 0 && (
          <div className="home-empty" data-testid="home-empty">
            <p className="home-empty-title">No recent files</p>
            <p className="home-empty-text">Create a new design or open an existing file.</p>
            <div className="home-actions">{actions}</div>
          </div>
        )}
        {entries && entries.length > 0 && (
          <>
            <div className="home-section">
              <h2 className="home-section-title">Recent files</h2>
              <span className="home-section-count">{shown.length === entries.length ? entries.length : `${shown.length} of ${entries.length}`}</span>
            </div>
            {shown.length === 0 ? (
              <p className="home-none" role="status">No files match “{query.trim()}”.</p>
            ) : (
              <ul ref={grid} className="home-grid" aria-label="Recent files">
                {shown.map((entry, i) => (
                  <Card
                    key={entry.path}
                    entry={entry}
                    now={now}
                    active={i === current}
                    menuOpen={menu?.path === entry.path}
                    onOpen={() => void open(entry)}
                    onFocus={() => setActive(i)}
                    onMenu={(x, y) => setMenu({ path: entry.path, x, y })}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {menu && menuEntry && <Menu label={menuEntry.name} x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </section>
  )
}
