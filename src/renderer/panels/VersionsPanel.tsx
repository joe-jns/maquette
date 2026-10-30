import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { parseDocument, serializeDocument } from '../../core/format'
import type { VersionInfo } from '../../shared/versions'
import { ask } from '../dialog/dialogStore'
import { docStore, useDoc } from '../state/store'
import { uiStore } from '../state/ui'
import { modalStore } from '../ui/Modals'
import { defaultVersionName, versionAge } from './versionsModel'

const api = () => window.maquette.versions

/**
 * Restaure une version : une version automatique « Before restore » du document actuel d'abord, puis le
 * document est remplacé en une seule étape annulable (Ctrl+Z revient en arrière).
 */
export async function restoreVersion(v: VersionInfo): Promise<boolean> {
  const store = docStore.getState()
  const text = await api().read(v.id).catch(() => null)
  const parsed = text === null ? null : parseDocument(text)
  if (!parsed?.ok) {
    store.showError(`Could not restore “${v.name}”: the version could not be read.`)
    return false
  }
  // Un texte en cours d'édition n'est dans le document qu'à sa fermeture : on le valide d'abord.
  if (uiStore.getState().editingTextId) (document.activeElement as HTMLElement | null)?.blur()
  await api().save(serializeDocument(docStore.getState().doc), 'Before restore', true).catch(() => null)
  docStore.getState().replaceDocument(parsed.doc, `Restore ${v.name}`)
  uiStore.getState().select([])
  return true
}

/** Champ de nom (enregistrer, renommer) : Entrée valide, Échap annule sans fermer la fenêtre. */
function NameField({ initial, label, onDone }: { initial: string; label: string; onDone(name: string | null): void }) {
  const [value, setValue] = useState(initial)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onDone(value.trim() || initial)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDone(null)
    }
  }
  return (
    <input
      ref={field}
      className="versions-name-field"
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onDone(null)}
    />
  )
}

/** Aperçu de la version choisie : rendu de son premier cadre (ou de sa première page). */
function Preview({ id }: { id: string | null }) {
  const [image, setImage] = useState<{ id: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    void api().preview(id).catch(() => null).then((url) => live && setImage({ id, url }))
    return () => {
      live = false
    }
  }, [id])
  const shown = image && image.id === id ? image : null
  return (
    <div className="versions-preview" data-testid="versions-preview">
      {!id ? null : !shown ? (
        <p className="empty-note">Loading preview…</p>
      ) : shown.url ? (
        <img src={shown.url} alt="Preview of the selected version" draggable={false} />
      ) : (
        <p className="empty-note">No preview (empty page).</p>
      )}
    </div>
  )
}

/**
 * Fenêtre « Version history » : versions du fichier ouvert, de la plus récente à la plus ancienne ;
 * enregistrer, restaurer, renommer, supprimer.
 */
export function VersionsPanel() {
  const filePath = useDoc((s) => s.filePath)
  const [list, setList] = useState<VersionInfo[] | null | undefined>(undefined)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null)
  const [proposed, setProposed] = useState('')

  const refresh = useCallback(async (select?: string) => {
    const versions = await api().list().catch(() => null)
    setList(versions)
    setSelected((current) => {
      const want = select ?? current
      return versions?.some((v) => v.id === want) ? want! : (versions?.[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, filePath])

  if (list === undefined) return <p className="empty-note versions-note">Loading…</p>
  if (list === null || !filePath) return <p className="empty-note versions-note">Save the file to keep versions.</p>

  const current = list.find((v) => v.id === selected) ?? null

  const saveNew = async (name: string | null) => {
    setEditing(null)
    if (!name) return
    const v = await api().save(serializeDocument(docStore.getState().doc), name, false).catch(() => null)
    await refresh(v?.id)
  }
  const rename = async (name: string | null) => {
    setEditing(null)
    if (!name || !current || name === current.name) return
    await api().rename(current.id, name).catch(() => false)
    await refresh()
  }
  const remove = async () => {
    if (!current) return
    const answer = await ask({
      message: `Delete the version “${current.name}”?`,
      detail: 'It will be erased. The document itself does not change.',
      buttons: [{ label: 'Cancel' }, { label: 'Delete', kind: 'danger' }],
      cancelIndex: 0,
      defaultIndex: 0,
    })
    if (answer !== 1) return
    await api().remove(current.id).catch(() => false)
    await refresh()
  }
  const restore = async () => {
    if (current && (await restoreVersion(current))) modalStore.getState().close()
  }

  return (
    <div className="versions">
      <div className="versions-bar">
        {editing === 'new' ? (
          <NameField initial={proposed} label="Version name" onDone={(name) => void saveNew(name)} />
        ) : (
          <button
            type="button"
            className="versions-button"
            onClick={() => {
              setProposed(defaultVersionName())
              setEditing('new')
            }}
          >
            Save version…
          </button>
        )}
      </div>
      <div className="versions-main">
        {list.length === 0 ? (
          <p className="empty-note versions-note">No versions yet. Claude saves one before each reply that changes the design.</p>
        ) : (
          <ul className="versions-list" role="listbox" aria-label="Versions" data-testid="versions-list">
            {list.map((v) => (
              <li
                key={v.id}
                role="option"
                aria-selected={v.id === selected}
                className={`versions-row${v.id === selected ? ' is-selected' : ''}`}
                data-testid="version-row"
                tabIndex={v.id === selected ? 0 : -1}
                onClick={() => setSelected(v.id)}
                onDoubleClick={() => {
                  setSelected(v.id)
                  setEditing('rename')
                }}
              >
                {editing === 'rename' && v.id === selected ? (
                  <NameField initial={v.name} label="New name" onDone={(name) => void rename(name)} />
                ) : (
                  <span className="versions-row-name">{v.name}</span>
                )}
                <span className="versions-row-meta">
                  <span>{versionAge(v.date)}</span>
                  {v.auto && <span className="versions-auto">Auto</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Preview id={current?.id ?? null} />
      </div>
      <footer className="versions-actions">
        <button type="button" className="versions-button" disabled={!current} onClick={() => setEditing('rename')}>
          Rename
        </button>
        <button type="button" className="versions-button" disabled={!current} onClick={() => void remove()}>
          Delete
        </button>
        <button type="button" className="versions-button is-primary" disabled={!current} onClick={() => void restore()}>
          Restore
        </button>
      </footer>
    </div>
  )
}
