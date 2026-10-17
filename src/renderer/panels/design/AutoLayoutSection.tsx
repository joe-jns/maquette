import type { AutoLayout, FrameNode, Node } from '../../../core/types'
import { addAutoLayoutOps } from '../../canvas/canvasOps'
import { domMeasure } from '../../canvas/measure'
import { useDoc } from '../../state/store'
import { mixed, setOps } from '../props'
import { NumberField } from './NumberField'
import { commit, Icon, IconButton, scrubWith, Section, useSelection } from './shared'

const isFrame = (n: Node): n is FrameNode => n.type === 'frame'
const ALIGN_VALUES = ['start', 'center', 'end'] as const
const ROW_NAMES = ['en haut', '', 'en bas']
const COL_NAMES = ['à gauche', '', 'à droite']

function cellLabel(r: number, c: number): string {
  if (r === 1 && c === 1) return 'Aligner au centre'
  const parts = [ROW_NAMES[r], COL_NAMES[c]].filter(Boolean)
  return `Aligner ${parts.join(' ')}`
}

/** Mise en page automatique d'un cadre, et réglages d'un enfant placé par elle. */
export function AutoLayoutSection() {
  const doc = useDoc((s) => s.doc)
  const { ids, nodes, locs } = useSelection()
  const frames = nodes.filter(isFrame)
  const allFrames = frames.length > 0 && frames.length === nodes.length
  const autos = frames.filter((f) => f.layout.mode === 'auto')
  const allAuto = allFrames && autos.length === frames.length
  const children = locs.filter((l) => l.parent?.layout.mode === 'auto')
  const allChildren = children.length > 0 && children.length === locs.length

  if (!allFrames && !allChildren) return null

  const setLayout = (patch: Partial<AutoLayout>) => setOps(ids, { layout: { mode: 'auto', ...patch } })
  const pick = <K extends keyof AutoLayout>(key: K) => mixed(autos.map((f) => (f.layout as AutoLayout)[key]))
  const direction = pick('direction')
  const gap = pick('gap')
  const padding = autos.map((f) => (f.layout as AutoLayout).padding)
  const justify = pick('justify')
  const align = pick('align')
  const wrap = pick('wrap')

  const padOps = (axis: 'h' | 'v', v: number) =>
    autos.map((f) => {
      const p = [...(f.layout as AutoLayout).padding] as AutoLayout['padding']
      if (axis === 'h') p[1] = p[3] = v
      else p[0] = p[2] = v
      return { op: 'update' as const, id: f.id, set: { layout: { mode: 'auto', padding: p } } }
    })

  const cellPressed = (r: number, c: number) => {
    if (direction === 'mixed' || justify === 'mixed' || align === 'mixed' || gap === 'auto') return false
    const h = ALIGN_VALUES[c]
    const v = ALIGN_VALUES[r]
    return direction === 'row' ? justify === h && align === v : justify === v && align === h
  }
  const cellOps = (r: number, c: number) => {
    const h = ALIGN_VALUES[c]!
    const v = ALIGN_VALUES[r]!
    return autos.map((f) => {
      const row = (f.layout as AutoLayout).direction === 'row'
      return { op: 'update' as const, id: f.id, set: { layout: { mode: 'auto', justify: row ? h : v, align: row ? v : h } } }
    })
  }

  return (
    <>
      {allFrames && (
        <Section
          title="Mise en page automatique"
          actions={
            allAuto ? (
              <IconButton label="Retirer la mise en page automatique" onClick={() => commit(setOps(ids, { layout: { mode: 'free' } }), 'Placement libre')}>
                <Icon d="M4 8h8" />
              </IconButton>
            ) : (
              <IconButton
                label="Ajouter la mise en page automatique"
                title="Ajouter la mise en page automatique (Maj+A)"
                onClick={() =>
                  commit(
                    frames.length === 1 ? addAutoLayoutOps(doc, ids, domMeasure).ops : setOps(ids, { layout: { mode: 'auto' } }),
                    'Mise en page automatique',
                  )
                }
              >
                <Icon d="M8 3v10M3 8h10" />
              </IconButton>
            )
          }
        >
          {allAuto && (
            <div className="auto-layout">
              <div className="auto-layout-top">
                <div className="segmented" role="group" aria-label="Direction">
                  <button type="button" aria-label="Direction : colonne" title="Colonne" aria-pressed={direction === 'column'} onClick={() => commit(setLayout({ direction: 'column' }), 'Direction')}>
                    <Icon d="M8 3v10M5 10l3 3 3-3" />
                  </button>
                  <button type="button" aria-label="Direction : ligne" title="Ligne" aria-pressed={direction === 'row'} onClick={() => commit(setLayout({ direction: 'row' }), 'Direction')}>
                    <Icon d="M3 8h10M10 5l3 3-3 3" />
                  </button>
                </div>
                <div className="align-grid" role="group" aria-label="Alignement">
                  {[0, 1, 2].map((r) =>
                    [0, 1, 2].map((c) => (
                      <button
                        key={`${r}${c}`}
                        type="button"
                        aria-label={cellLabel(r, c)}
                        title={cellLabel(r, c)}
                        aria-pressed={cellPressed(r, c)}
                        onClick={() => commit(cellOps(r, c), 'Alignement')}
                      >
                        <span />
                      </button>
                    )),
                  )}
                </div>
              </div>
              <div className="field-grid">
                <NumberField
                  name="Espacement"
                  label="↔"
                  min={0}
                  value={gap === 'auto' ? null : gap}
                  onCommit={(v) => commit(setLayout({ gap: v }), 'Espacement')}
                  scrub={scrubWith('Espacement', (v) => setLayout({ gap: Math.max(0, v) }))}
                />
                <IconButton
                  label="Espacement automatique"
                  title="Espacement automatique (répartir)"
                  pressed={gap === 'auto'}
                  onClick={() => commit(setLayout({ gap: gap === 'auto' ? 0 : 'auto' }), 'Espacement')}
                >
                  <Icon d="M3 4v8M13 4v8M6 8h4" />
                </IconButton>
                <NumberField
                  name="Marge horizontale"
                  label="⇿"
                  min={0}
                  value={mixed(padding.flatMap((p) => [p[1], p[3]]))}
                  onCommit={(v) => commit(padOps('h', v), 'Marges')}
                  scrub={scrubWith('Marges', (v) => padOps('h', Math.max(0, v)))}
                />
                <NumberField
                  name="Marge verticale"
                  label="⇕"
                  min={0}
                  value={mixed(padding.flatMap((p) => [p[0], p[2]]))}
                  onCommit={(v) => commit(padOps('v', v), 'Marges')}
                  scrub={scrubWith('Marges', (v) => padOps('v', Math.max(0, v)))}
                />
              </div>
              <label className="check-row">
                <input type="checkbox" checked={wrap === true} onChange={(e) => commit(setLayout({ wrap: e.target.checked }), 'Retour à la ligne')} />
                Retour à la ligne
              </label>
            </div>
          )}
        </Section>
      )}
      {allChildren && (
        <Section title="Dans la mise en page">
          <div className="child-layout">
            <label className="select-field">
              <span>Alignement</span>
              <select
                aria-label="Alignement propre"
                value={mixed(children.map((l) => l.node.alignSelf ?? 'auto')) === 'mixed' ? '' : (children[0]!.node.alignSelf ?? 'auto')}
                onChange={(e) => commit(setOps(ids, { alignSelf: e.target.value === 'auto' ? null : e.target.value }), 'Alignement propre')}
              >
                <option value="" disabled>Mixte</option>
                <option value="auto">Comme le cadre</option>
                <option value="start">Début</option>
                <option value="center">Centre</option>
                <option value="end">Fin</option>
                <option value="stretch">Étirer</option>
              </select>
            </label>
            <IconButton
              label="Position absolue"
              title="Ignorer la mise en page automatique (position absolue)"
              pressed={children.every((l) => l.node.position === 'absolute')}
              onClick={() => {
                const absolute = children.every((l) => l.node.position === 'absolute')
                commit(setOps(ids, { position: absolute ? 'flow' : 'absolute' }), 'Position absolue')
              }}
            >
              <Icon d="M3 3h4v4H3zM9 9h4v4H9zM7 5h3v4" />
            </IconButton>
          </div>
        </Section>
      )}
    </>
  )
}
