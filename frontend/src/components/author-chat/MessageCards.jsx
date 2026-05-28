import { useState } from 'react'
import { Wrench, Loader, Check, ChevronDown, ChevronRight, Brain, User, PenTool, FileText, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../../hooks/useI18n'

export function StreamingToolCard({ segment }) {
  const hasResult = segment.status === 'done' && segment.result
  const resultLooksBad = /Error|Warning|失败|低于|少于|blocked/i.test(segment.result ?? '')
  return (
    <div style={{
      padding: '5px 10px',
      borderLeft: `3px solid ${resultLooksBad ? 'var(--warning)' : '#00BCD4'}`,
      background: 'var(--bg-elevated)',
      borderRadius: '0 6px 6px 0',
      fontSize: 11,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Wrench size={10} style={{ color: '#00BCD4', flexShrink: 0 }} />
        <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--ink)' }}>{segment.name}</code>
        {segment.status === 'running'
          ? <Loader size={10} style={{ animation: 'spin 1.5s linear infinite', color: '#00BCD4' }} />
          : <Check size={10} style={{ color: resultLooksBad ? 'var(--warning)' : '#4CAF50' }} />
        }
      </div>
      {hasResult && (
        <div style={{
          color: resultLooksBad ? 'var(--warning)' : 'var(--ink-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: 'monospace',
        }}>
          {segment.result}
        </div>
      )}
    </div>
  )
}

export function ThinkingCard({ segment, t }) {
  const live = !!segment.streaming
  const [expanded, setExpanded] = useState(false)
  const len = segment.text?.length ?? 0
  return (
    <div style={{
      width: '100%',
      borderLeft: '3px solid rgba(139,92,246,0.55)',
      paddingLeft: 8,
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          color: live ? 'rgba(139,92,246,1)' : 'rgba(139,92,246,0.85)', fontWeight: 600,
        }}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Brain size={11} />
        执行分析已折叠 ({len} {t('authorChat.chars')})
        {live && <span className="agent-shimmer"> · thinking</span>}
      </button>
      {expanded && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginTop: 4,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
          border: '1px solid rgba(139,92,246,0.15)', fontSize: 11, lineHeight: 1.6,
          color: 'var(--ink-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {segment.text || '(空)'}
          {live && <span style={{ animation: 'pulse 1s infinite' }}>▍</span>}
        </div>
      )}
    </div>
  )
}

export function OptionsCard({ segment, disabled, onSelect }) {
  return (
    <div style={{
      borderLeft: '3px solid #8b5cf6',
      background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))',
      borderRadius: '0 8px 8px 0',
      padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {segment.description && (
        <div style={{ fontSize: 12, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
          {segment.description}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segment.options.map((opt, i) => (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onSelect?.(opt)}
            style={{
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--ink)',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              fontSize: 12,
              lineHeight: 1.5,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (disabled) return
              e.currentTarget.style.borderColor = '#8b5cf6'
              e.currentTarget.style.background = 'rgba(139,92,246,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.background = 'var(--bg-elevated)'
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToolCallCard({ segment }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        padding: '5px 10px',
        borderLeft: '3px solid #00BCD4',
        background: 'var(--bg-elevated)',
        borderRadius: '0 6px 6px 0',
        fontSize: 11,
        cursor: segment.result ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onClick={() => segment.result && setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {segment.result ? (
          expanded ? <ChevronDown size={10} style={{ color: 'var(--ink-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--ink-muted)' }} />
        ) : null}
        <Wrench size={10} style={{ color: '#00BCD4', flexShrink: 0 }} />
        <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--ink)' }}>{segment.name}</code>
        {segment.argsPreview && (
          <span style={{ color: 'var(--ink-muted)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ({segment.argsPreview})
          </span>
        )}
        <Check size={10} style={{ color: '#4CAF50', marginLeft: 'auto' }} />
      </div>
      {expanded && segment.result && (
        <pre style={{
          margin: '4px 0 0 20px', fontSize: 10, color: 'var(--ink-muted)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 200, overflowY: 'auto',
          padding: '4px 0', borderTop: '1px solid var(--border-subtle)', marginTop: 4
        }}>{segment.result}</pre>
      )}
    </div>
  )
}

export function MessageBubble({ msg, onOptionSelect, optionsDisabled, onCheckpointEdit, checkpointEditDisabled }) {
  const { t } = useI18n()
  const isUser = msg.role === 'user'
  const canEditCheckpoint = isUser && msg.id && msg.checkpoint_id && !checkpointEditDisabled

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
        {isUser ? <><User size={9} /> {t('authorChat.you')}</> : <><PenTool size={9} /> {t('authorChat.author')}</>}
        {canEditCheckpoint && (
          <button
            type="button"
            onClick={() => onCheckpointEdit?.(msg)}
            title="编辑并从这里重新运行"
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)',
              borderRadius: 5,
              background: 'var(--bg-elevated)',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Pencil size={10} />
          </button>
        )}
      </div>

      {msg.attachmentNames?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {msg.attachmentNames.map((name, j) => (
            <span key={j} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: 'var(--accent)', color: 'white', opacity: 0.8,
              display: 'flex', alignItems: 'center', gap: 3
            }}>
              <FileText size={9} /> {name}
            </span>
          ))}
        </div>
      )}

      {!isUser && msg.segments ? (
        <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          {msg.thinking && !msg.segments.some(s => s.type === 'thinking') && (
            <ThinkingCard segment={{ text: msg.thinking }} t={t} />
          )}
          {msg.segments.map((seg, i) => (
            seg.type === 'content' ? (
              <div key={i} className="markdown-chat" style={{
                padding: '10px 14px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                background: 'var(--bg-elevated)', color: 'var(--ink)',
                borderBottomLeftRadius: 4,
              }}>
                <ReactMarkdown>{seg.text}</ReactMarkdown>
              </div>
            ) : seg.type === 'thinking' ? (
              <ThinkingCard key={i} segment={seg} t={t} />
            ) : seg.type === 'tool_call' ? (
              <ToolCallCard key={i} segment={seg} />
            ) : seg.type === 'options' ? (
              <OptionsCard key={i} segment={seg} disabled={optionsDisabled} onSelect={onOptionSelect} />
            ) : null
          ))}
        </div>
      ) : (
        <div className={isUser ? '' : 'markdown-chat'} style={{
          maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
          fontSize: 13, lineHeight: 1.6,
          whiteSpace: isUser ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
          background: isUser ? 'var(--accent)' : 'var(--bg-elevated)',
          color: isUser ? 'white' : 'var(--ink)',
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
        }}>
          {isUser
            ? (msg.hasAttachments ? msg.content.split('\n\n--- 附件:')[0] || t('authorChat.sentAttachment') : msg.content)
            : <ReactMarkdown>{msg.content}</ReactMarkdown>
          }
        </div>
      )}
    </div>
  )
}
