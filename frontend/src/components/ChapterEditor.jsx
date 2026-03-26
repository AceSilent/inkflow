import { useState, useEffect } from 'react'
import { FileText, PenTool, RotateCw, Loader, BookOpen, Copy, ChevronDown, ChevronRight, Eye, Shield, Zap, BookCheck, AlertTriangle } from 'lucide-react'

export function ChapterEditor({ bookId, chapterId, chapterLabel, addToast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [reviews, setReviews] = useState(null)
  const [iceberg, setIceberg] = useState(null)
  const [detailOutline, setDetailOutline] = useState(null)
  const [icebergOpen, setIcebergOpen] = useState(false)
  const [reviewsOpen, setReviewsOpen] = useState(false)

  const fetchChapter = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`)
      if (resp.ok) setData(await resp.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchReviews = async () => {
    try {
      const resp = await fetch(`/api/v1/writing/${bookId}/chapters/${chapterId}/reviews`)
      if (resp.ok) setReviews(await resp.json())
    } catch (e) { console.error(e) }
  }

  const fetchIceberg = async () => {
    try {
      const resp = await fetch(`/api/v1/writing/${bookId}/chapters/${chapterId}/iceberg`)
      if (resp.ok) setIceberg(await resp.json())
    } catch (e) { console.error(e) }
  }

  const fetchDetailOutline = async () => {
    try {
      const resp = await fetch(`/api/v1/writing/${bookId}/chapters/${chapterId}/detail-outline`)
      if (resp.ok) {
        const d = await resp.json()
        if (d) setDetailOutline(d)
      }
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (bookId && chapterId) {
      fetchChapter()
      fetchReviews()
      fetchIceberg()
      fetchDetailOutline()
    }
  }, [bookId, chapterId])

  const handleGenerate = async (regenerate = false) => {
    setGenerating(true)
    setProgress('📐 生成章节细纲...')
    try {
      const resp = await fetch(`/api/v1/writing/${bookId}/generate-chapter/${chapterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate })
      })
      if (resp.ok) {
        const result = await resp.json()
        setData(prev => ({ ...prev, content: result.content, status: 'draft', word_count: result.word_count }))
        addToast?.(`✅ 已生成「${data?.label || chapterId}」— ${result.word_count}字`, 'success')
        fetchReviews()
        fetchIceberg()
        fetchDetailOutline()
      } else {
        const err = await resp.json().catch(() => ({}))
        addToast?.(`生成失败: ${err.detail || '未知错误'}`, 'error')
      }
    } catch (e) {
      addToast?.('生成失败: 网络错误', 'error')
    } finally {
      setGenerating(false)
      setProgress('')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--text-muted)' }}>
        <Loader size={24} className="spin" />
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

  // Aggregate review scores
  const readerScores = {}
  if (reviews?.scenes) {
    for (const scene of reviews.scenes) {
      for (const fb of (scene.reader_feedbacks || [])) {
        if (!readerScores[fb.reader_role]) readerScores[fb.reader_role] = { total: 0, count: 0, issues: [] }
        readerScores[fb.reader_role].total += fb.immersion_score
        readerScores[fb.reader_role].count += 1
        readerScores[fb.reader_role].issues.push(...(fb.issues || []))
      }
    }
  }

  const readerConfig = {
    lore_keeper: { label: '考据党', icon: BookCheck, color: '--success' },
    pacing_junkie: { label: '体验派', icon: Zap, color: '--info' },
    anti_trope: { label: '排雷兵', icon: Eye, color: '--warning' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--titlebar-h) - var(--tabbar-h) - var(--statusbar-h) - 16px)', padding: '0 16px', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{data.label}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
          {data.word_count > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.word_count}字</span>}
          {detailOutline?.scenes && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detailOutline.scenes.length}个场景</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {data.content && <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(data.content); addToast?.('已复制', 'success') }}><Copy size={12} /> 复制</button>}
          {data.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => handleGenerate(true)} disabled={generating}><RotateCw size={12} /> 重新生成</button>}
        </div>
      </div>

      {/* Reader Scores Bar */}
      {Object.keys(readerScores).length > 0 && (
        <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {Object.entries(readerConfig).map(([role, cfg]) => {
            const s = readerScores[role]
            if (!s) return null
            const avg = Math.round(s.total / s.count * 10) / 10
            const Icon = cfg.icon
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-surface)', fontSize: 12 }}>
                <Icon size={14} style={{ color: `var(${cfg.color})` }} />
                <span style={{ fontWeight: 600 }}>{cfg.label}</span>
                <span style={{ fontWeight: 700, color: avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{avg}/10</span>
                {s.issues.length > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({s.issues.length}个问题)</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Outline summary */}
      {data.summary && (
        <div style={{ padding: '10px 14px', margin: '12px 0', borderRadius: 8, background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>📋 章节大纲</div>
          {data.summary}
        </div>
      )}

      {/* Detail Outline — Scene Beats */}
      {detailOutline?.scenes && detailOutline.scenes.length > 0 && (
        <CollapsibleSection title="📐 场景细纲" defaultOpen={!data.content}>
          {detailOutline.scenes.map((scene, i) => (
            <div key={scene.scene_id} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 6, background: 'var(--bg-surface)', fontSize: 12, borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>场景{i+1}：{scene.title}</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span>👤 {scene.pov}</span>
                {scene.location && <span> · 📍 {scene.location}</span>}
                {scene.emotion_arc && <span> · 💫 {scene.emotion_arc}</span>}
                <div>🎯 {scene.goal}</div>
                {scene.conflict && <div>⚔️ {scene.conflict}</div>}
              </div>
            </div>
          ))}
          {detailOutline.chapter_hook && (
            <div style={{ fontSize: 12, color: 'var(--warning)', fontStyle: 'italic', marginTop: 4 }}>
              🪝 章末钩子：{detailOutline.chapter_hook}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Iceberg Analysis */}
      {iceberg?.scenes && iceberg.scenes.length > 0 && (
        <CollapsibleSection title="🧊 冰山引擎分析" defaultOpen={false}>
          {iceberg.scenes.map(s => (
            <div key={s.scene_id} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 6, background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.1)', fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>{s.scene_id}</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{s.analysis}</pre>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Review Details */}
      {reviews?.scenes && reviews.scenes.some(s => s.reader_feedbacks?.length > 0) && (
        <CollapsibleSection title="📊 读者评审详情" defaultOpen={false}>
          {reviews.scenes.map(scene => (
            <div key={scene.scene_id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{scene.scene_id}</div>
              {(scene.reader_feedbacks || []).map((fb, fi) => (
                <div key={fi} style={{ padding: '6px 10px', marginBottom: 4, borderRadius: 6, background: 'var(--bg-surface)', fontSize: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{readerConfig[fb.reader_role]?.label || fb.reader_role}</span>
                    <span style={{ color: fb.immersion_score >= 7 ? 'var(--success)' : fb.immersion_score >= 5 ? 'var(--warning)' : 'var(--danger)', fontWeight: 700 }}>{fb.immersion_score}/10</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fb.emotional_watermark}</span>
                  </div>
                  {(fb.issues || []).map((iss, ii) => (
                    <div key={ii} style={{ padding: '4px 8px', margin: '2px 0', borderLeft: `2px solid var(${iss.severity >= 4 ? '--danger' : iss.severity >= 3 ? '--warning' : '--text-muted'})`, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600 }}>[{iss.error_type}]</span> Sev:{iss.severity} · {iss.description}
                      {iss.quote && <div style={{ fontStyle: 'italic', opacity: 0.7 }}>"{iss.quote}"</div>}
                    </div>
                  ))}
                </div>
              ))}
              {scene.editor_plan && (
                <div style={{ padding: '6px 10px', borderRadius: 6, background: scene.editor_plan.pass_status ? 'rgba(72,199,142,0.08)' : 'rgba(245,101,101,0.08)', border: `1px solid ${scene.editor_plan.pass_status ? 'rgba(72,199,142,0.2)' : 'rgba(245,101,101,0.2)'}`, fontSize: 12, marginTop: 4 }}>
                  <span style={{ fontWeight: 600, color: scene.editor_plan.pass_status ? 'var(--success)' : 'var(--danger)' }}>
                    {scene.editor_plan.pass_status ? '✅ 主编通过' : '❌ 主编驳回'}
                  </span>
                  {scene.editor_plan.revision_instructions?.length > 0 && (
                    <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: 11 }}>
                      {scene.editor_plan.revision_instructions.map((inst, i) => <li key={i}>{inst}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Content area */}
      <div style={{ flex: 1, padding: '16px 0', minHeight: 0 }}>
        {data.content ? (
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {/* Scene-separated content */}
            {detailOutline?.scenes ? (
              detailOutline.scenes.map((scene, i) => {
                const sceneResult = reviews?.scenes?.find(s => s.scene_id === scene.scene_id)
                const avgScore = sceneResult?.reader_feedbacks?.length > 0
                  ? Math.round(sceneResult.reader_feedbacks.reduce((s, f) => s + f.immersion_score, 0) / sceneResult.reader_feedbacks.length * 10) / 10
                  : null
                // Try to find scene text from individual scene files
                return (
                  <div key={scene.scene_id} style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed var(--border-subtle)' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--accent)', fontWeight: 700 }}>S{i+1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{scene.title}</span>
                      {scene.emotion_arc && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{scene.emotion_arc}</span>}
                      {avgScore && <span style={{ fontSize: 10, fontWeight: 700, color: avgScore >= 7 ? 'var(--success)' : avgScore >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{avgScore}分</span>}
                    </div>
                  </div>
                )
              })
            ) : null}
            <div style={{ fontFamily: 'var(--font-prose, "Noto Serif SC", serif)', fontSize: 16, lineHeight: 2, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {data.content}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16 }}>
            <BookOpen size={48} style={{ opacity: 0.1 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>本章尚未生成正文</p>
            <button className="btn btn-primary" onClick={() => handleGenerate(false)} disabled={generating} style={{ fontSize: 14, padding: '8px 24px' }}>
              {generating ? <><Loader size={14} className="spin" /> {progress}</> : <><PenTool size={14} /> 生成本章正文</>}
            </button>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 400, textAlign: 'center' }}>
              流程：章节细纲 → 场景冰山分析 → 逐场景起草(600-1000字) → 3位读者评审 → 主编仲裁 → 组装章节
            </p>
          </div>
        )}
      </div>

      {/* Generating overlay */}
      {generating && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 100 }}>
          <Loader size={14} className="spin" />
          {progress || '生成中...'}
        </div>
      )}
    </div>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 8, flexShrink: 0 }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 0' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  )
}
