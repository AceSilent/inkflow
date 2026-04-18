import { useEffect, useState } from 'react'

const EDGE_COLOR = {
  causes: 'var(--ink)',
  triggers: 'var(--ink)',
  enables: 'var(--ink-secondary)',
  blocks: 'var(--accent)',
  'pays-off': 'var(--success)',
  parallel: 'var(--ink-muted)',
}

export function EdgesOverlay({ edges, containerRef }) {
  const [positions, setPositions] = useState(null)

  useEffect(() => {
    function compute() {
      if (!containerRef.current) return
      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const map = {}
      container.querySelectorAll('.plot-node').forEach(el => {
        const id = el.getAttribute('data-node-id')
        if (!id) return
        const r = el.getBoundingClientRect()
        map[id] = {
          x: r.left - containerRect.left + r.width / 2,
          y: r.top - containerRect.top + r.height / 2,
          w: r.width,
          h: r.height,
        }
      })
      setPositions(map)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('scroll', compute, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', compute, true)
    }
  }, [containerRef, edges])

  if (!positions) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <defs>
        {Object.entries(EDGE_COLOR).map(([key, color]) => (
          <marker
            key={key}
            id={`arrow-${key}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill={color} />
          </marker>
        ))}
      </defs>
      {edges.map(e => {
        const a = positions[e.from]
        const b = positions[e.to]
        if (!a || !b) return null
        let d
        if (e.type === 'pays-off') {
          const peak = Math.min(a.y, b.y) - 40
          const midX = (a.x + b.x) / 2
          d = `M ${a.x} ${a.y} Q ${midX} ${peak} ${b.x} ${b.y}`
        } else {
          const cx = (a.x + b.x) / 2
          d = `M ${a.x} ${a.y} Q ${cx} ${a.y}, ${cx} ${(a.y + b.y) / 2} T ${b.x} ${b.y}`
        }
        const isDashed = e.type === 'pays-off' || e.type === 'blocks' || e.type === 'parallel'
        return (
          <path
            key={e.id}
            d={d}
            stroke={EDGE_COLOR[e.type]}
            strokeWidth={e.type === 'pays-off' ? 1.5 : 1.2}
            strokeDasharray={isDashed ? (e.type === 'parallel' ? '2 3' : '5 3') : undefined}
            fill="none"
            markerEnd={`url(#arrow-${e.type})`}
          />
        )
      })}
    </svg>
  )
}
