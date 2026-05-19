import { useState, useCallback, useMemo } from 'react'

function applyTemplateVars(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`)
}

function DirectionCue({ direction }) {
  if (!direction) return null
  const cues = []
  if (direction.bgm) cues.push(`♪ ${direction.bgm}`)
  if (direction.sfx) cues.push(`♪ ${direction.sfx}`)
  if (direction.bg) cues.push(`🎬 ${direction.bg}`)
  if (cues.length === 0) return null
  return <div className="preview-direction">{cues.join(' | ')}</div>
}

function PreviewLine({ line, vars }) {
  const text = applyTemplateVars(line.text || '', vars)
  const speaker = line.speaker ? applyTemplateVars(line.speaker, vars) : ''

  if (line.type === 'dialogue' || (line.speaker && line.type !== 'narration')) {
    return (
      <div className="preview-line preview-dialogue">
        <DirectionCue direction={line.direction} />
        <span className="preview-speaker">{speaker}</span>
        {line.emotion && <span className="preview-emotion">[{line.emotion}]</span>}
        <span className="preview-text">「{text}」</span>
      </div>
    )
  }
  if (line.type === 'action') {
    return (
      <div className="preview-line preview-action">
        <DirectionCue direction={line.direction} />
        <em>{text}</em>
      </div>
    )
  }
  if (line.type === 'thought') {
    return (
      <div className="preview-line preview-thought">
        <DirectionCue direction={line.direction} />
        <span>（{speaker ? `${speaker}心想：` : ''}{text}）</span>
      </div>
    )
  }
  return (
    <div className="preview-line preview-narration">
      <DirectionCue direction={line.direction} />
      <span>{text}</span>
    </div>
  )
}

export function ScriptPreview({ stages = [], templateVars: initialVars = {} }) {
  const [currentStageId, setCurrentStageId] = useState(stages[0]?.id || '')
  const [lineIndex, setLineIndex] = useState(0)
  const [vars, setVars] = useState(initialVars)
  const [history, setHistory] = useState([])

  const currentStage = useMemo(
    () => stages.find(s => s.id === currentStageId),
    [stages, currentStageId]
  )
  const visibleLines = currentStage?.lines?.slice(0, lineIndex + 1) || []
  const allLinesShown = lineIndex >= (currentStage?.lines?.length || 0) - 1
  const choices = allLinesShown ? (currentStage?.choices || []) : []

  const advance = useCallback(() => {
    if (!allLinesShown) {
      setLineIndex(i => i + 1)
    } else if (currentStage?.advance_next) {
      setHistory(h => [...h, currentStageId])
      setCurrentStageId(currentStage.advance_next)
      setLineIndex(0)
    }
  }, [allLinesShown, currentStage, currentStageId])

  const chooseOption = useCallback((nextStageId) => {
    setHistory(h => [...h, currentStageId])
    setCurrentStageId(nextStageId)
    setLineIndex(0)
  }, [currentStageId])

  const restart = useCallback(() => {
    setCurrentStageId(stages[0]?.id || '')
    setLineIndex(0)
    setHistory([])
  }, [stages])

  return (
    <div className="script-preview">
      <div className="preview-vars">
        <label>player_name:
          <input value={vars.player_name || ''} onChange={e => setVars({ ...vars, player_name: e.target.value })} />
        </label>
      </div>
      <div className="preview-stage-label">
        [{currentStageId}] · 第 {lineIndex + 1}/{currentStage?.lines?.length || 0} 行
      </div>
      <div className="preview-lines" onClick={choices.length === 0 ? advance : undefined}>
        {visibleLines.map((line, i) => (
          <PreviewLine key={line.id || i} line={line} vars={vars} />
        ))}
      </div>
      {choices.length > 0 && (
        <div className="preview-choices">
          {choices.map(c => (
            <button key={c.id} onClick={() => chooseOption(c.next_stage)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {currentStage?.is_terminal && allLinesShown && (
        <div className="preview-terminal">
          <p>— 终 —</p>
          <button onClick={restart}>重新开始</button>
        </div>
      )}
      {history.length > 0 && (
        <div className="preview-history">
          经过: {history.join(' → ')} → {currentStageId}
        </div>
      )}
    </div>
  )
}
