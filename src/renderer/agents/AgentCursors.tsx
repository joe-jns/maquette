import { useEffect, useRef, useState } from 'react'
import type { Rect } from '../../core/types'
import type { Point } from '../canvas/geometry'
import { worldToScreen } from '../canvas/camera'
import { useUi } from '../state/ui'
import { agentStore, useAgents, type Agent } from './agentStore'
import './agents.css'

const GLIDE_MS = 520
/** Entre deux outils, au-delà de ce délai pendant une réponse, le curseur « pense ». */
const THINK_AFTER_MS = 1500
const FADE_MS = 300

const ease = (t: number) => 1 - (1 - t) ** 3

/** Pointe du curseur : un peu à l'intérieur du coin haut-gauche de la zone visée. */
const tipOf = (r: Rect): Point => ({ x: r.x + Math.min(24, r.width / 2), y: r.y + Math.min(24, r.height / 2) })

/** Point du monde qui glisse vers sa cible (le glissement vit en coordonnées du monde : zoom et panoramique le suivent). */
function useGlide(target: Point | null): Point | null {
  const [pos, setPos] = useState<Point | null>(target)
  const from = useRef<Point | null>(target)
  const posRef = useRef(pos)
  posRef.current = pos
  useEffect(() => {
    if (!target) return
    const start = posRef.current
    if (!start) {
      setPos(target)
      return
    }
    from.current = start
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / GLIDE_MS))
      setPos({ x: start.x + (target.x - start.x) * k, y: start.y + (target.y - start.y) * k })
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target?.x, target?.y]) // eslint-disable-line react-hooks/exhaustive-deps
  return pos
}

function AgentCursor({ agent, leaving }: { agent: Agent; leaving: boolean }) {
  const camera = useUi((s) => s.camera)
  const pos = useGlide(agent.target && tipOf(agent.target))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  if (!pos || !agent.target) return null
  const p = worldToScreen(camera, pos)
  const r = agent.target
  const box = { ...worldToScreen(camera, r), width: r.width * camera.zoom, height: r.height * camera.zoom }
  const thinking = agent.busy && now - agent.lastActive > THINK_AFTER_MS
  return (
    <>
      <div
        key={`${r.x},${r.y},${r.width},${r.height}`}
        className="agent-target"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height, ['--agent' as string]: agent.color }}
        aria-hidden
      />
      <div
        className={`agent-cursor${leaving ? ' is-leaving' : ''}`}
        data-testid={`agent-cursor-${agent.id}`}
        data-agent={agent.id}
        style={{ transform: `translate(${p.x}px, ${p.y}px)`, ['--agent' as string]: agent.color }}
        aria-hidden
      >
        <svg viewBox="0 0 16 18" width="20" height="22">
          <path d="M1.5 1.5 14 8.2 8.4 9.6 5.6 15.8z" style={{ fill: agent.color }} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="agent-label">
          {agent.name}
          {thinking && (
            <span className="agent-thinking">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
      </div>
    </>
  )
}

/**
 * Curseurs des agents sur le canevas (comme Pen) : chacun glisse vers ce qu'il touche, la zone s'entoure un instant.
 * Purement visuel : aucun événement de souris, on continue de travailler dessous.
 */
export function AgentCursors() {
  const agents = useAgents((s) => s.agents)
  // Un agent retiré reste affiché le temps de son fondu.
  const [leaving, setLeaving] = useState<Record<string, Agent>>({})
  const prev = useRef(agents)
  useEffect(() => {
    const gone = Object.values(prev.current).filter((a) => !agents[a.id])
    prev.current = agents
    if (!gone.length) return
    setLeaving((l) => ({ ...l, ...Object.fromEntries(gone.map((a) => [a.id, a])) }))
    const t = setTimeout(() => setLeaving((l) => Object.fromEntries(Object.entries(l).filter(([id]) => !gone.some((a) => a.id === id)))), FADE_MS)
    return () => clearTimeout(t)
  }, [agents])
  useEffect(() => {
    const t = setInterval(() => agentStore.getState().prune(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="agent-layer">
      {Object.values(agents).map((a) => <AgentCursor key={a.id} agent={a} leaving={false} />)}
      {Object.values(leaving).filter((a) => !agents[a.id]).map((a) => <AgentCursor key={`${a.id}-out`} agent={a} leaving />)}
    </div>
  )
}
