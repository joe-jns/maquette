import type { AutoLayout, FrameNode, Node } from '../../../core/types'
import { addAutoLayoutOps } from '../../canvas/canvasOps'
import { domMeasure } from '../../canvas/measure'
import { useDoc } from '../../state/store'
import { Checkbox } from '../../ui/Checkbox'
import { Select } from '../../ui/Select'
import { mixed, setOps } from '../props'
import { NumberField } from './NumberField'
import { commit, FIELD_GLYPH, Icon, IconButton, scrubWith, Section, useSelection } from './shared'

const isFrame = (n: Node): n is FrameNode => n.type === 'frame'
type SelfAlign = 'auto' | 'start' | 'center' | 'end' | 'stretch'
const SELF_OPTIONS: { value: SelfAlign; label: string }[] = [
  { value: 'auto', label: 'Comme le cadre' },
  { value: 'start', label: 'Début' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'Fin' },
  { value: 'stretch', label: 'Étirer' },
]
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
              {/* Comme Figma : direction et espacement à gauche, grille d'alignement à droite. */}
              <div className="auto-layout-top">
                <div className="auto-layout-left">
                  <div className="segmented" role="group" aria-label="Direction">
                    <button type="button" aria-label="Direction : colonne" title="Colonne" aria-pressed={direction === 'column'} onClick={() => commit(setLayout({ direction: 'column' }), 'Direction')}>
                      <Icon d="M8 3v10M5 10l3 3 3-3" />
                    </button>
                    <button type="button" aria-label="Direction : ligne" title="Ligne" aria-pressed={direction === 'row'} onClick={() => commit(setLayout({ direction: 'row' }), 'Direction')}>
                      <Icon d="M3 8h10M10 5l3 3-3 3" />
                    </button>
                  </div>
                  <NumberField
                    name="Espacement"
                    label={<Icon d="M3.5 3v10M12.5 3v10M6.5 8h3" />}
                    min={0}
                    value={gap === 'auto' ? null : gap}
                    placeholder="Auto"
                    onCommit={(v) => commit(setLayout({ gap: v }), 'Espacement')}
                    scrub={scrubWith('Espacement', (v) => setLayout({ gap: Math.max(0, v) }))}
                    trailing={
                      <button
                        type="button"
                        className={`field-toggle${gap === 'auto' ? ' is-pressed' : ''}`}
                        aria-label="Espacement automatique"
                        title="Espacement automatique (répartir)"
                        aria-pressed={gap === 'auto'}
                        onClick={() => commit(setLayout({ gap: gap === 'auto' ? 0 : 'auto' }), 'Espacement')}
                      >
                        <Icon d="M2.5 4v8M13.5 4v8M5.5 8h5M7 6.5 5.5 8 7 9.5M9 6.5l1.5 1.5L9 9.5" />
                      </button>
                    }
                  />
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
                  name="Marge horizontale"
                  label={<Icon d={FIELD_GLYPH.padH} />}
                  min={0}
                  value={mixed(padding.flatMap((p) => [p[1], p[3]]))}
                  onCommit={(v) => commit(padOps('h', v), 'Marges')}
                  scrub={scrubWith('Marges', (v) => padOps('h', Math.max(0, v)))}
                />
                <NumberField
                  name="Marge verticale"
                  label={<Icon d={FIELD_GLYPH.padV} />}
                  min={0}
                  value={mixed(padding.flatMap((p) => [p[0], p[2]]))}
                  onCommit={(v) => commit(padOps('v', v), 'Marges')}
                  scrub={scrubWith('Marges', (v) => padOps('v', Math.max(0, v)))}
                />
              </div>
              <Checkbox checked={wrap === 'mixed' ? 'mixed' : wrap === true} onChange={(on) => commit(setLayout({ wrap: on }), 'Retour à la ligne')}>
                Retour à la ligne
              </Checkbox>
            </div>
          )}
        </Section>
      )}
      {allChildren && (
        <Section title="Dans la mise en page">
          <div className="child-layout">
            <div className="select-field">
              <span aria-hidden>Alignement</span>
              <Select
                label="Alignement propre"
                value={mixed(children.map((l) => l.node.alignSelf ?? 'auto')) === 'mixed' ? null : (children[0]!.node.alignSelf ?? 'auto')}
                options={SELF_OPTIONS}
                onChange={(v) => commit(setOps(ids, { alignSelf: v === 'auto' ? null : v }), 'Alignement propre')}
              />
            </div>
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
