import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader, Plus } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'
import { AddNodeModal } from './plotgraph/AddNodeModal'
import { NodeDetailDrawer } from './plotgraph/NodeDetailDrawer'

const NODE_COLORS = {
  event: 'var(--ink)',
  setup: 'var(--reviewer-lore)',
  payoff: 'var(--success)',
  decision: 'var(--accent)',
  turning_point: 'var(--ink)',
  convergence: 'var(--reviewer-pacing)',
}

function chRefToOrder(chId) {
  const n = parseInt(String(chId).replace(/^ch/i, ''), 10)
  return Number.isNaN(n) ? 9999 : n
}

export function PlotGraphView({ currentBook, addToast, onChapterOpen, dataVersion }) {
  const { t } = useI18n()
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unresolved, setUnresolved] = useState([])
  const [detailNodeId, setDetailNodeId] = useState(null)
  const [addNodeOpen, setAddNodeOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!currentBook) { setLoading(false); return }
    setLoading(true)
    try {
      const [g, u] = await Promise.all([
        fetch(`/api/v1/books/${currentBook.book_id}/plot-graph`).then(r => r.json()),
        fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/unresolved-setups`).then(r => r.json()),
      ])
      setGraph(g)
      setUnresolved(Array.isArray(u) ? u : [])
    } catch (err) {
      if (addToast) addToast(err?.message || String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [currentBook, addToast])

  useEffect(() => { reload() }, [reload, dataVersion])

  const columns = useMemo(() => {
    if (!graph?.nodes) return []
    const byCh = {}
    for (const node of Object.values(graph.nodes)) {
      const refs = Array.isArray(node.references) ? [...node.references].sort() : []
      const ch = refs[0] ?? 'ch00'
      if (!byCh[ch]) byCh[ch] = []
      byCh[ch].push(node)
    }
    return Object.entries(byCh)
      .sort(([a], [b]) => chRefToOrder(a) - chRefToOrder(b))
  }, [graph])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={24} className="anim-spin" />
      </div>
    )
  }
  if (!currentBook) {
    return <div style={{ padding: 40, color: 'var(--ink-muted)' }}>{t('outline.noBook')}</div>
  }

  const nodeCount = Object.keys(graph?.nodes ?? {}).length
  const edgeCount = graph?.edges?.length ?? 0
  const detailNode = detailNodeId ? graph?.nodes?.[detailNodeId] : null

  return (
    <div
      className="plot-graph-view"
      data-detail-node={detailNodeId || undefined}
      data-add-node-open={addNodeOpen ? 'true' : undefined}
    >
      <div className="plot-topbar">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>— Plot Graph —</div>
        <div className="plot-stats">
          <span className="label-sc">{nodeCount} Nodes · {edgeCount} Edges</span>
          {unresolved.length > 0 && (
            <span className="plot-unresolved label-sc" style={{ color: 'var(--accent)', marginLeft: 8 }}>
              · {unresolved.length} {t('plotGraph.unresolved')}
            </span>
          )}
        </div>
        <div className="plot-actions">
          <button className="btn btn-sm" onClick={() => setAddNodeOpen(true)}>
            <Plus size={12} /> {t('plotGraph.addNode')}
          </button>
        </div>
      </div>

      <div className="plot-timeline-scroll">
        <div className="plot-timeline">
          {columns.map(([chId, nodes]) => (
            <div key={chId} className="plot-col" data-ch={chId}>
              <div
                className="plot-col-head label-sc"
                onClick={() => onChapterOpen && onChapterOpen({ id: chId, label: `Ch. ${toRoman(chRefToOrder(chId))}` })}
              >
                Ch. {toRoman(chRefToOrder(chId))}
              </div>
              {nodes.map(n => (
                <div
                  key={n.id}
                  className={`plot-node plot-node-${n.type}`}
                  data-status={n.status}
                  onClick={() => setDetailNodeId(n.id)}
                  style={{ borderLeftColor: NODE_COLORS[n.type] }}
                >
                  <div className="plot-node-type label-sc">{n.type}</div>
                  <div className="plot-node-title">{n.title}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* SVG edges overlay is wired in a later task (T11). */}

      <NodeDetailDrawer
        open={!!detailNode}
        node={detailNode}
        edges={graph?.edges ?? []}
        nodes={graph?.nodes ?? {}}
        onClose={() => setDetailNodeId(null)}
        onPatch={async (patch) => {
          await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes/${detailNodeId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
          reload()
        }}
        onDelete={async () => {
          await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes/${detailNodeId}`, { method: 'DELETE' })
          setDetailNodeId(null)
          reload()
        }}
        onEdgeRemove={async (edgeId) => {
          await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/edges/${edgeId}`, { method: 'DELETE' })
          reload()
        }}
      />

      <AddNodeModal
        open={addNodeOpen}
        onCancel={() => setAddNodeOpen(false)}
        onSubmit={async (body) => {
          try {
            const r = await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!r.ok) {
              const err = await r.json().catch(() => ({}))
              addToast?.(`创建失败：${err.error || r.statusText}`, 'error')
              return
            }
            addToast?.('节点已创建', 'success')
            setAddNodeOpen(false)
            reload()
          } catch (e) {
            addToast?.(`出错：${e.message}`, 'error')
          }
        }}
      />
    </div>
  )
}
