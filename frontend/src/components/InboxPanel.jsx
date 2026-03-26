import { useState, useEffect } from 'react'
import { useI18n } from '../i18n/index.jsx'
import { Inbox, AlertTriangle, CheckCircle, Loader, ExternalLink } from 'lucide-react'

export function InboxPanel({ currentBook, onChapterClick, addToast }) {
  const { t } = useI18n()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/inbox' + (currentBook ? `?book_id=${currentBook}` : ''))
      if (resp.ok) {
        setTasks(await resp.json())
      } else {
        // Try loading from reviews dir for chapters that need human intervention
        if (currentBook) {
          const chaptersResp = await fetch(`/api/v1/books/${currentBook}/chapters`)
          if (chaptersResp.ok) {
            const chapters = await chaptersResp.json()
            const needsAttention = []
            for (const ch of (chapters || [])) {
              try {
                const reviewResp = await fetch(`/api/v1/writing/${currentBook}/chapters/${ch.id}/reviews`)
                if (reviewResp.ok) {
                  const review = await reviewResp.json()
                  const needsHuman = (review?.scenes || []).some(s => s.state === 'needs_human')
                  if (needsHuman) {
                    needsAttention.push({
                      task_id: ch.id,
                      book_id: currentBook,
                      chapter_id: ch.id,
                      title: `${ch.label || ch.id} — 需要人工介入`,
                      status: 'needs_human',
                      reason: '作者Agent三次重试仍未通过读者审查',
                    })
                  }
                }
              } catch {}
            }
            setTasks(needsAttention)
          }
        } else {
          setTasks([])
        }
      }
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTasks() }, [currentBook])

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><Loader size={18} className="spin" /></div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Inbox size={20} style={{ color: 'var(--accent)' }} /> {t('nav.inbox')}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>需要人工介入的章节（作者Agent三次审查未通过）</p>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <CheckCircle size={32} style={{ color: 'var(--success)', opacity: 0.5, marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>暂无待处理任务</p>
          <p style={{ fontSize: 12 }}>所有章节的审查环节均已自动完成</p>
        </div>
      ) : (
        <div>
          {tasks.map(task => (
            <div key={task.task_id} className="card anim-scale" style={{ marginBottom: 12, cursor: 'pointer', borderLeft: '3px solid var(--danger)' }}
              onClick={() => onChapterClick?.(task.book_id, task.chapter_id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{task.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <AlertTriangle size={12} style={{ color: 'var(--danger)', marginRight: 4 }} />
                    {task.reason || '需要人工审核'}
                  </div>
                </div>
                <ExternalLink size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
