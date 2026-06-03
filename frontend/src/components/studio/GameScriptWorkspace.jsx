import { useEffect, useMemo, useState } from 'react'
import { Loader } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'
import { summarizeGameOutline, summarizeScriptPackages } from './gameScriptWorkspaceData'

export function GameScriptWorkspace({ currentBook, dataVersion }) {
  const bookId = currentBook?.book_id
  const [outline, setOutline] = useState(null)
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!bookId) {
      setOutline(null)
      setScripts([])
      setLoading(false)
      setLoadError(false)
      return
    }

    let cancelled = false
    const encodedBookId = encodeURIComponent(bookId)
    setLoading(true)
    setLoadError(false)

    async function loadGameWorkspace() {
      try {
        const [outlineResponse, scriptsResponse] = await Promise.all([
          fetch(`/api/v1/books/${encodedBookId}/game-outline`),
          fetch(`/api/v1/books/${encodedBookId}/scripts`),
        ])
        if (!outlineResponse.ok || !scriptsResponse.ok) throw new Error('game workspace load failed')
        const outlineData = await outlineResponse.json()
        const scriptsData = await scriptsResponse.json()
        if (cancelled) return
        setOutline(outlineData)
        setScripts(Array.isArray(scriptsData?.scripts) ? scriptsData.scripts : [])
        setLoadError(false)
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGameWorkspace()

    return () => {
      cancelled = true
    }
  }, [bookId, dataVersion])

  return (
    <GameScriptWorkspaceView
      currentBook={currentBook}
      outline={outline}
      scripts={scripts}
      loading={loading}
      loadError={loadError}
    />
  )
}

export function GameScriptWorkspaceView({ currentBook, outline, scripts, loading, loadError }) {
  const { t } = useI18n()
  const outlineSummary = useMemo(() => summarizeGameOutline(outline), [outline])
  const scriptSummary = useMemo(() => summarizeScriptPackages(scripts), [scripts])
  const title = currentBook?.title || currentBook?.book_id || ''
  const packageMetric = scriptSummary.packageCount > 0 ? scriptSummary.packageCount : outlineSummary.packageCount
  const stageMetric = scriptSummary.packageCount > 0 ? scriptSummary.stageCount : outlineSummary.stageCount

  if (!currentBook) {
    return (
      <div className="game-script-empty">
        {t('gameWorkspace.empty')}
      </div>
    )
  }

  if (loading && !outline) {
    return (
      <div className="game-script-empty">
        <Loader size={18} className="anim-spin" />
        {t('gameWorkspace.loading')}
      </div>
    )
  }

  if (loadError && !outline) {
    return (
      <div className="game-script-empty">
        {t('gameWorkspace.error')}
      </div>
    )
  }

  return (
    <div className="game-script-workspace">
      <header className="game-script-head">
        <div>
          <div className="game-script-kicker">{t('gameWorkspace.kicker')}</div>
          <h2>{t('gameWorkspace.title')}</h2>
        </div>
        <div className="game-script-book-title">{title}</div>
      </header>

      <div className="game-script-metrics" aria-label={t('gameWorkspace.title')}>
        <Metric label={t('gameWorkspace.arcs')} value={outlineSummary.arcCount} />
        <Metric label={t('gameWorkspace.packages')} value={packageMetric} />
        <Metric label={t('gameWorkspace.stages')} value={stageMetric} />
        <Metric label={t('gameWorkspace.lines')} value={scriptSummary.lineCount} />
        <Metric label={t('gameWorkspace.choices')} value={scriptSummary.choiceCount} />
      </div>

      <section className="game-script-section" aria-labelledby="game-outline-heading">
        <div className="game-script-section-title" id="game-outline-heading">{t('gameWorkspace.outline')}</div>
        {outlineSummary.arcs.length > 0 ? (
          <div className="game-outline-list">
            {outlineSummary.arcs.map(arc => (
              <div className="game-outline-arc" key={arc.id}>
                <div className="game-outline-arc-main">
                  <span className="game-outline-dot" />
                  <span className="game-outline-title">{arc.label}</span>
                  <span className="game-outline-meta">{arc.packageCount} {t('gameWorkspace.packages')} · {arc.stageCount} {t('gameWorkspace.stages')}</span>
                </div>
                {arc.packages.length > 0 && (
                  <div className="game-outline-packages">
                    {arc.packages.map(pkg => (
                      <div className="game-outline-package" key={pkg.id}>
                        <span>{pkg.label}</span>
                        <span>{pkg.stageCount} {t('gameWorkspace.stages')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="game-script-muted">{t('gameWorkspace.noOutline')}</div>
        )}
      </section>

      <section className="game-script-section" aria-labelledby="game-scripts-heading">
        <div className="game-script-section-title" id="game-scripts-heading">{t('gameWorkspace.scripts')}</div>
        {scriptSummary.packages.length > 0 ? (
          <div className="game-package-list">
            {scriptSummary.packages.map(pkg => (
              <div className="game-package-row" key={pkg.package_id}>
                <div className="game-package-main">
                  <span className="game-package-name">{pkg.name || pkg.package_id}</span>
                  <span className="game-package-id">{pkg.package_id}</span>
                </div>
                <div className="game-package-stats">
                  <span>{pkg.stage_count || 0} {t('gameWorkspace.stages')}</span>
                  <span>{pkg.line_count || 0} {t('gameWorkspace.lines')}</span>
                  <span>{pkg.choice_count || 0} {t('gameWorkspace.choices')}</span>
                  <span>{t('gameWorkspace.locale')} {pkg.source_locale || 'zh-CN'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="game-script-muted">{t('gameWorkspace.noScripts')}</div>
        )}
      </section>

      {loadError && (
        <div className="game-script-status">{t('gameWorkspace.error')}</div>
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="game-script-metric">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  )
}
