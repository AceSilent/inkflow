import { useState, useEffect, useCallback } from 'react'
import { FileText, BookOpen, Copy, ChevronDown, ChevronRight, Shield, Zap, Eye, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

const reviewerConfig = {
  editorial_lore: { label: '设定检查', icon: Shield, color: '--success' },
  editorial_pacing: { label: '节奏评审', icon: Zap, color: '--info' },
  editorial_ai_tone: { label: 'AI腔调', icon: Eye, color: '--warning' },
}

export function ChapterEditor({ bookId, chapterId, chapterLabel, addToast, dataVersion }) {
  const [data, setData] = useState(null)
  const [reviews, setReviews] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reviewsOpen, setReviewsOpen] = useState(false)

  const fetchData = useCallback(async () => {
    if (!bookId || !chapterId) return
    setLoading(true)
    try {
      const [chapterRes, reviewRes] = await Promise.all([
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`),
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/reviews`),
      ])
      if (chapterRes.ok) setData(await chapterRes.json())
      if (reviewRes.ok) {
        const reviewData = await reviewRes.json()
        if (reviewData && reviewData.feedbacks?.length > 0) setReviews(reviewData)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [bookId, chapterId])

  useEffect(() => {
    fetchData()
  }, [fetchData, dataVersion])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--text-muted)' }}>
        <RefreshCw size={20} className="spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <FileText size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p>无法加载章节数据</p>
      </div>
    )
  }

  const statusMap = {
    outline: { label: '大纲', color: 'var(--warning)', bg: 'rgba(255,193,7,0.12)' },
    draft: { label: '草稿', color: 'var(--accent)', bg: 'rgba(99,179,237,0.12)' },
    reviewed: { label: '已审阅', color: 'var(--success)', bg: 'rgba(72,199,142,0.12)' },
  }
  const st = statusMap[data.status] || statusMap.outline

  const issueCount = reviews?.feedbacks?.reduce((sum, fb) => sum + (fb.issues?.length || 0), 0) || 0
  const hasReviews = reviews?.feedbacks?.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{data.label || chapterLabel}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
          {data.word_count > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.word_count}字</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {data.content && (
            <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(data.content); addToast?.('已复制', 'success') }}>
              <Copy size={12} /> 复制
            </button>
          )}
        </div>
      </div>

      {/* Review Summary Bar */}
      {hasReviews && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: reviews.overall_pass ? 'rgba(72,199,142,0.12)' : 'rgba(245,101,101,0.12)',
            color: reviews.overall_pass ? 'var(--success)' : 'var(--danger)',
          }}>
            {reviews.overall_pass ? <CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: -2 }} /> : <XCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} />}
            {reviews.overall_pass ? ' 全部通过' : ' 需修改'}
          </div>
          {reviews.feedbacks.map((fb, i) => {
            const cfg = reviewerConfig[fb.reviewer] || { label: fb.reviewer, color: '--text-muted' }
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4, background: 'var(--bg-surface)', fontSize: 11 }}>
                <span style={{ color: fb.pass_status ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {fb.pass_status ? '✓' : '✗'}
                </span>
                <span>{cfg.label}</span>
                {fb.issues?.length > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>({fb.issues.length})</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
        {/* Outline summary */}
        {data.summary && (
          <div style={{ padding: '10px 14px', margin: '12px 0', borderRadius: 8, background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>
              <FileText size={11} style={{ display: 'inline', verticalAlign: -1 }} /> 章节大纲
            </div>
            {data.summary}
          </div>
        )}

        {/* Review Details — collapsible */}
        {hasReviews && (
          <div style={{ marginBottom: 12, flexShrink: 0 }}>
            <button onClick={() => setReviewsOpen(!reviewsOpen)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 0' }}>
              {reviewsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              评审详情 ({issueCount} 个问题)
            </button>
            {reviewsOpen && (
              <div style={{ paddingLeft: 4 }}>
                {reviews.feedbacks.map((fb, fi) => {
                  const cfg = reviewerConfig[fb.reviewer] || { label: fb.reviewer, icon: Shield, color: '--text-muted' }
                  return (
                    <div key={fi} style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 6, background: 'var(--bg-surface)', fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{cfg.label}</span>
                        <span style={{ color: fb.pass_status ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                          {fb.pass_status ? '通过' : '未通过'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{fb.quick_comment}</span>
                      </div>
                      {(fb.issues || []).map((iss, ii) => (
                        <div key={ii} style={{
                          padding: '4px 8px', margin: '3px 0', borderLeft: `3px solid var(${iss.severity >= 4 ? '--danger' : iss.severity >= 3 ? '--warning' : '--text-muted'})`,
                          fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderRadius: '0 4px 4px 0',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: iss.severity >= 4 ? 'var(--danger)' : 'var(--warning)' }}>[{iss.type}]</span>
                            <span style={{ color: 'var(--text-muted)' }}>Sev:{iss.severity}</span>
                          </div>
                          {iss.quote && (
                            <div style={{ fontStyle: 'italic', opacity: 0.7, marginTop: 2 }}>"{iss.quote}"</div>
                          )}
                          {iss.fix_instruction && (
                            <div style={{ color: 'var(--accent)', marginTop: 2 }}>→ {iss.fix_instruction}</div>
                          )}
                        </div>
                      ))}
                      {(!fb.issues || fb.issues.length === 0) && fb.pass_status && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>无问题</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, padding: '16px 0', minHeight: 0 }}>
          {data.content ? (
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div style={{
                fontFamily: 'var(--font-prose, "Noto Serif SC", serif)',
                fontSize: 16, lineHeight: 2, whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)',
              }}>
                {data.content}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16 }}>
              <BookOpen size={48} style={{ opacity: 0.1 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>本章尚未生成正文</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 400, textAlign: 'center' }}>
                在「作者对话」或「创意沙盘」中让 Agent 使用 save_draft 工具来生成本章草稿
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
