import { useState, useEffect } from 'react'
import { useI18n } from '../i18n/index.jsx'
import { Snowflake, Loader } from 'lucide-react'

export function IcebergPanel({ currentBook, currentChapter }) {
  const { t } = useI18n()
  const [iceberg, setIceberg] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!currentBook || !currentChapter) { setIceberg(null); return }
    setLoading(true)
    fetch(`/api/v1/writing/${currentBook}/chapters/${currentChapter}/iceberg`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setIceberg(data); setLoading(false) })
      .catch(() => { setIceberg(null); setLoading(false) })
  }, [currentBook, currentChapter])

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}><Loader size={18} className="spin" /></div>
  }

  if (!currentChapter) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Snowflake size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p style={{ fontSize: 13 }}>请选择一个章节查看冰山分析</p>
        <p style={{ fontSize: 11 }}>冰山分析会在正文生成过程中自动产生</p>
      </div>
    )
  }

  if (!iceberg?.scenes || iceberg.scenes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Snowflake size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p style={{ fontSize: 13 }}>{t('iceberg.placeholder.internal')}</p>
        <p style={{ fontSize: 11 }}>生成正文时，冰山引擎会自动分析每个场景的潜台词、感官锚点、情绪暗流</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 8px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Snowflake size={16} style={{ color: 'var(--accent)' }} /> 冰山引擎分析
      </h3>
      {iceberg.scenes.map((scene, i) => (
        <div key={scene.scene_id || i} style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.1)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
            场景{i + 1}：{scene.scene_id}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            {scene.analysis}
          </pre>
        </div>
      ))}
    </div>
  )
}
