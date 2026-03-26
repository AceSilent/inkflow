import { useEffect, useRef } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

export function EmotionPanel() {
  const { t } = useI18n()
  const canvasRef = useRef(null)

  useEffect(() => { drawChart() }, [])

  function drawChart() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const data = [45, 62, 78, 70, 85]
    const labels = ['Ch1', 'Ch2', 'Ch3', 'Ch4', 'Ch5']
    const pad = { top: 15, right: 15, bottom: 25, left: 35 }
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom
    ctx.clearRect(0, 0, w, h)
    const styles = getComputedStyle(document.documentElement)
    const gridCol = styles.getPropertyValue('--border-subtle').trim() || '#313244'
    const textCol = styles.getPropertyValue('--text-muted').trim() || '#6c7086'
    const lineCol = styles.getPropertyValue('--accent').trim() || '#b4befe'
    ctx.strokeStyle = gridCol; ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) { const y = pad.top + (ch/4)*i; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w-pad.right, y); ctx.stroke() }
    ctx.fillStyle = textCol; ctx.font = '9px Inter, sans-serif'; ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) ctx.fillText((100-i*25).toString(), pad.left-5, pad.top+(ch/4)*i+3)
    ctx.textAlign = 'center'
    data.forEach((_, i) => ctx.fillText(labels[i], pad.left+(cw/(data.length-1))*i, h-5))
    const grad = ctx.createLinearGradient(0, pad.top, 0, h-pad.bottom)
    grad.addColorStop(0, 'rgba(180,190,254,0.2)'); grad.addColorStop(1, 'rgba(180,190,254,0)')
    ctx.beginPath()
    data.forEach((v,i) => { const x=pad.left+(cw/(data.length-1))*i, y=pad.top+ch-(v/100)*ch; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) })
    ctx.lineTo(pad.left+cw, pad.top+ch); ctx.lineTo(pad.left, pad.top+ch); ctx.closePath()
    ctx.fillStyle = grad; ctx.fill()
    ctx.beginPath(); ctx.strokeStyle = lineCol; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    data.forEach((v,i) => { const x=pad.left+(cw/(data.length-1))*i, y=pad.top+ch-(v/100)*ch; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) })
    ctx.stroke()
    data.forEach((v,i) => {
      const x=pad.left+(cw/(data.length-1))*i, y=pad.top+ch-(v/100)*ch
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fillStyle = lineCol; ctx.fill()
      ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fillStyle = styles.getPropertyValue('--bg-surface').trim()||'#282a3a'; ctx.fill()
    })
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t('emotion.tension')}</div>
        <ScoreRing value={72} max={100} size={64} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t('emotion.last5')}</div>
        <canvas ref={canvasRef} width={260} height={140} style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t('emotion.alerts')}</div>
        <AlertBox type="warning" icon={AlertTriangle} title={t('emotion.highTension')} desc={t('emotion.highTensionDesc')} />
        <AlertBox type="info" icon={Info} title={t('emotion.normalDensity')} desc={t('emotion.normalDensityDesc')} />
      </div>
      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>{t('emotion.stats')}</div>
        <div className="stat-row"><span className="stat-label">{t('emotion.totalWords')}</span><span className="stat-value">12,450</span></div>
        <div className="stat-row"><span className="stat-label">{t('emotion.avgScene')}</span><span className="stat-value">2,490</span></div>
        <div className="stat-row"><span className="stat-label">{t('emotion.dialogueRatio')}</span><span className="stat-value">38%</span></div>
        <div className="stat-row"><span className="stat-label">{t('emotion.innerRatio')}</span><span className="stat-value">22%</span></div>
      </div>
    </div>
  )
}

function ScoreRing({ value, max, size }) {
  const r = (size-8)/2, circ = 2*Math.PI*r, off = circ-(value/max)*circ
  const col = value>=70?'var(--danger)':value>=40?'var(--warning)':'var(--success)'
  return (
    <div className="score-ring" style={{ width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle className="score-ring-track" cx={size/2} cy={size/2} r={r} />
        <circle className="score-ring-fill" cx={size/2} cy={size/2} r={r} stroke={col} strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <span className="score-ring-val">{value}%</span>
    </div>
  )
}

function AlertBox({ type, icon: Icon, title, desc }) {
  return (
    <div style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-md)', background: `var(--${type}-bg)`, borderLeft: `3px solid var(--${type})` }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Icon size={11} /> {title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</div>
    </div>
  )
}
