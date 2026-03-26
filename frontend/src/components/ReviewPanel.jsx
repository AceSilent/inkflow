import { useState, useEffect } from 'react'
import { Play, CheckCircle, BookOpen, Shield, Zap, Eye, Bot, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

export function ReviewPanel({ currentBook, addToast }) {
  const { t } = useI18n()
  const [chapters, setChapters] = useState([])
  const [selectedChapter, setSelectedChapter] = useState('')
  const [reviewData, setReviewData] = useState(null)
  const [loading, setLoading] = useState(false)

  // Load chapters list
  useEffect(() => {
    if (!currentBook) return
    fetch(`/api/v1/books/${currentBook}/chapters`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const chs = (data || []).filter(c => c.status === 'draft' || c.status === 'reviewed')
        setChapters(chs)
        if (chs.length > 0 && !selectedChapter) setSelectedChapter(chs[0].id)
      })
      .catch(() => {})
  }, [currentBook])

  // Load review data for selected chapter
  useEffect(() => {
    if (!currentBook || !selectedChapter) return
    setLoading(true)
    fetch(`/api/v1/writing/${currentBook}/chapters/${selectedChapter}/reviews`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setReviewData(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [currentBook, selectedChapter])

  const readerConfig = {
    scene_lore_checker: { label: '场景设定检查', icon: BookOpen, color: '--success' },
    scene_pacing_reviewer: { label: '场景节奏评审', icon: Zap, color: '--info' },
    scene_ai_tone_detector: { label: '场景AI腔检测', icon: Bot, color: '--warning' },
    lore_keeper: { label: '考据党', icon: BookOpen, color: '--success' },
    pacing_junkie: { label: '节奏体验官', icon: Zap, color: '--info' },
    anti_trope_scanner: { label: '反套路扫描', icon: Eye, color: '--accent' },
    anti_ai_tone_scanner: { label: 'AI味排雷', icon: Bot, color: '--warning' },
  }

  // Aggregate scores
  const aggregated = {}
  if (reviewData?.scenes) {
    for (const scene of reviewData.scenes) {
      for (const fb of (scene.reader_feedbacks || [])) {
        if (!aggregated[fb.reader_role]) aggregated[fb.reader_role] = { total: 0, count: 0, issues: [], emotion: '' }
        aggregated[fb.reader_role].total += fb.immersion_score
        aggregated[fb.reader_role].count += 1
        aggregated[fb.reader_role].issues.push(...(fb.issues || []))
        aggregated[fb.reader_role].emotion = fb.emotional_watermark
      }
    }
  }
  // Chapter-level reviews
  if (reviewData?.chapter_review?.feedbacks) {
    for (const fb of reviewData.chapter_review.feedbacks) {
      if (!aggregated[fb.reader_role]) aggregated[fb.reader_role] = { total: 0, count: 0, issues: [], emotion: '' }
      aggregated[fb.reader_role].total += fb.immersion_score
      aggregated[fb.reader_role].count += 1
      aggregated[fb.reader_role].issues.push(...(fb.issues || []))
      aggregated[fb.reader_role].emotion = fb.emotional_watermark
    }
  }

  if (!currentBook) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>请先选择一本书</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Shield size={20} style={{ color: 'var(--accent)' }} /> {t('review.title')}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>7位读者Agent的真实评审结果（3场景级 + 4章节级）</p>
      </div>

      {/* Chapter Selector */}
      <div style={{ marginBottom: 16 }}>
        <select className="select" value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} style={{ maxWidth: 300 }}>
          {chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.label || ch.id}</option>)}
        </select>
      </div>

      {loading && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>{[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>}

      {!loading && reviewData && Object.keys(aggregated).length > 0 && (
        <>
          {/* Score Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            {Object.entries(aggregated).map(([role, data]) => {
              const cfg = readerConfig[role] || { label: role, icon: Bot, color: '--text-muted' }
              const Icon = cfg.icon
              const avg = data.count > 0 ? Math.round(data.total / data.count * 10) / 10 : 0
              return (
                <div key={role} className="card anim-scale" style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ marginBottom: 6 }}><Icon size={20} style={{ color: `var(${cfg.color})` }} /></div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{cfg.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{avg}/10</div>
                  <span className={`badge badge-${avg >= 7 ? 'success' : avg >= 5 ? 'warning' : 'danger'}`} style={{ marginTop: 4 }}>{data.emotion}</span>
                  {data.issues.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{data.issues.length}个问题</div>}
                </div>
              )
            })}
          </div>

          {/* Issues List */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>发现的问题</h3>
              {Object.entries(aggregated).flatMap(([role, data]) =>
                data.issues.map((iss, i) => ({ ...iss, role, key: `${role}_${i}` }))
              ).sort((a, b) => b.severity - a.severity).slice(0, 20).map(iss => (
                <div key={iss.key} style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', marginBottom: 6, borderLeft: `3px solid var(${iss.severity >= 4 ? '--danger' : iss.severity >= 3 ? '--warning' : '--text-muted'})` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span className={`badge badge-${iss.severity >= 4 ? 'danger' : iss.severity >= 3 ? 'warning' : 'info'}`}>{iss.error_type}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sev {iss.severity} · {readerConfig[iss.role]?.label || iss.role}</span>
                  </div>
                  {iss.quote && <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 2 }}>"{iss.quote}"</div>}
                  <div style={{ fontSize: 12 }}>{iss.description}</div>
                </div>
              ))}
              {Object.values(aggregated).every(d => d.issues.length === 0) && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <CheckCircle size={20} style={{ color: 'var(--success)', marginBottom: 8 }} />
                  <div>所有读者Agent未发现严重问题</div>
                </div>
              )}
            </div>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>审阅级别</h3>
              <div className="card" style={{ marginBottom: 12, borderLeftWidth: 3, borderLeftColor: 'var(--accent)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🔬 场景级审阅 (3位)</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>设定检查 · 节奏评审 · AI腔检测</div>
              </div>
              <div className="card" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--success)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📖 章节级审阅 (4位)</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>考据党 · 节奏体验官 · 反套路扫描 · AI味排雷</div>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && (!reviewData || Object.keys(aggregated).length === 0) && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <AlertTriangle size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ fontSize: 13 }}>该章节尚无评审数据。请先在 ChapterEditor 中生成正文。</p>
        </div>
      )}
    </div>
  )
}
