import { useEffect, useState } from 'react'
import { useActivity } from './activityStore'
import './agents.css'

/** Claude Code extérieur n'a pas de début ni de fin de réponse : entre deux outils, il travaille encore pendant ce temps. */
const IDLE_MS = 3000

/** Pastille sur le canevas tant que Claude travaille. Purement visuelle : aucun événement de souris. */
export function ClaudeWorking() {
  const busy = useActivity((s) => s.busy)
  const running = useActivity((s) => s.running)
  const lastTool = useActivity((s) => s.lastTool)
  const [, tick] = useState(0)
  const left = lastTool + IDLE_MS - Date.now()
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => tick((n) => n + 1), left)
    return () => clearTimeout(t)
  }, [lastTool]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!busy && running === 0 && left <= 0) return null
  return (
    <div className="claude-working" data-testid="claude-working" role="status">
      Claude is working
      <span className="claude-working-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
