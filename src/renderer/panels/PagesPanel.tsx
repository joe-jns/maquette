import { useState } from 'react'
import { docStore, useDoc } from '../state/store'
import { uiStore } from '../state/ui'
import { Icon } from '../ui/icons'
import { ContextMenu } from './ContextMenu'
import { InlineName } from './InlineName'

export function showPage(id: string): void {
  docStore.getState().setPage(id)
  uiStore.getState().select([])
  uiStore.getState().setEditing(null)
  uiStore.getState().requestFit()
}

/** Liste des pages : ajouter, renommer, changer, réordonner, supprimer. */
export function PagesPanel() {
  const pages = useDoc((s) => s.doc.pages)
  const current = useDoc((s) => s.pageId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)

  const add = () => {
    const name = `Page ${pages.length + 1}`
    const r = docStore.getState().dispatch([{ op: 'page.create', id: '$page', name }], 'Ajouter une page')
    if (r.ok && r.ids['$page']) showPage(r.ids['$page'])
  }

  const remove = (id: string) => {
    const index = pages.findIndex((p) => p.id === id)
    const r = docStore.getState().dispatch([{ op: 'page.delete', id }], 'Supprimer la page')
    if (r.ok && id === current) showPage(r.doc.pages[Math.max(0, index - 1)]!.id)
  }

  return (
    <section className="panel-section" data-testid="pages" aria-label="Pages">
      <header className="panel-heading">
        <h2>Pages</h2>
        <button type="button" className="icon-button" aria-label="Ajouter une page" title="Ajouter une page" onClick={add}>
          <Icon name="plus" size={16} />
        </button>
      </header>
      <ul className="page-list">
        {pages.map((page, index) => (
          <li
            key={page.id}
            data-page-id={page.id}
            aria-current={page.id === current ? 'page' : undefined}
            className={page.id === current ? 'is-current' : undefined}
            draggable={renaming !== page.id}
            onDragStart={() => setDragged(page.id)}
            onDragOver={(e) => {
              if (dragged) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (dragged && dragged !== page.id) {
                docStore.getState().dispatch([{ op: 'page.move', id: dragged, index }], 'Réordonner les pages')
              }
              setDragged(null)
            }}
            onDragEnd={() => setDragged(null)}
            onClick={() => page.id !== current && showPage(page.id)}
            onDoubleClick={() => setRenaming(page.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ id: page.id, x: e.clientX, y: e.clientY })
            }}
          >
            {renaming === page.id ? (
              <InlineName
                value={page.name}
                onCommit={(name) => docStore.getState().dispatch([{ op: 'page.update', id: page.id, name }], 'Renommer la page')}
                onDone={() => setRenaming(null)}
              />
            ) : (
              <span className="page-name">{page.name}</span>
            )}
          </li>
        ))}
      </ul>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Renommer', onSelect: () => setRenaming(menu.id) },
            { label: 'Supprimer la page', danger: true, disabled: pages.length <= 1, onSelect: () => remove(menu.id) },
          ]}
        />
      )}
    </section>
  )
}
