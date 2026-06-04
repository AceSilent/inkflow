import { useState } from 'react'
import { Loader, ChevronDown, ChevronRight, FileText, Pencil, SquareTerminal } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'
import { messageDisplayParts, visibleUserMessageContent } from './messageUtils'
import { groupAssistantSegments, toolActivityLine, toolActivitySummary } from './toolActivity'
import { MarkdownContent } from './MarkdownContent'

function resultLooksBad(result) {
  return /Error|Warning|失败|低于|少于|blocked/i.test(result ?? '')
}

export function ToolActivityGroup({ segments }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const running = segments.some(segment => segment.status === 'running')

  return (
    <div className={`tool-activity-group ${expanded ? 'is-expanded' : ''} ${running ? 'is-running' : ''}`}>
      <button
        type="button"
        className="tool-activity-summary"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
      >
        <SquareTerminal size={14} />
        <span>{toolActivitySummary(segments, t)}</span>
        {running && <Loader size={12} className="tool-activity-spinner" />}
        <ChevronDown size={14} className="tool-activity-chevron" />
      </button>

      {expanded && (
        <div className="tool-activity-list">
          {segments.map((segment, index) => (
            <div key={`${segment.name}-${index}`} className="tool-activity-row">
              <span className="tool-activity-line">{toolActivityLine(segment, t)}</span>
              {segment.result && (
                <span className={`tool-activity-result ${resultLooksBad(segment.result) ? 'is-warning' : ''}`}>
                  {segment.result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThinkingCard({ segment, t }) {
  const live = !!segment.streaming
  const [expanded, setExpanded] = useState(false)
  const len = segment.text?.length ?? 0
  const token = live ? 'thinking...' : 'thought'
  return (
    <div className={`thinking-card ${live ? 'is-live' : ''}`}>
      <button
        type="button"
        className="thinking-toggle"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="thinking-pulse-dot" aria-hidden="true" />
        <span className={`thinking-token ${live ? 'agent-shimmer' : ''}`}>{token}</span>
        <span className="thinking-detail">{t('authorChat.thinkingCollapsed')} · {len} {t('authorChat.chars')}</span>
      </button>
      {expanded && (
        <div className="thinking-body">
          {segment.text || '(空)'}
          {live && <span className="typewriter-caret" aria-hidden="true" />}
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

function attachmentLineLabel(t, count) {
  return t('authorChat.attachmentLines').replace('{count}', count)
}

function AttachmentCodeBlock({ attachment, t }) {
  const [level, setLevel] = useState('preview')
  const lines = attachment.content ? attachment.content.split(/\r?\n/) : []
  const canExpand = lines.length > 5
  const visibleContent = level === 'full'
    ? attachment.content
    : level === 'preview'
      ? lines.slice(0, 5).join('\n')
      : ''
  const primaryLabel = level === 'collapsed'
    ? t('authorChat.attachmentCollapsed')
    : level === 'preview' && canExpand
      ? t('authorChat.attachmentPreview')
      : t('authorChat.attachmentFull')
  const primaryAction = () => {
    if (level === 'collapsed') setLevel('preview')
    else if (level === 'preview' && canExpand) setLevel('full')
    else setLevel('collapsed')
  }

  return (
    <div className={`chat-attachment-code-block is-${level}`}>
      <div className="chat-attachment-code-head">
        <FileText size={13} />
        <span className="chat-attachment-code-name">{attachment.name}</span>
        <span className="chat-attachment-code-meta">{attachment.language}</span>
        <span className="chat-attachment-code-meta">{attachment.sizeLabel}</span>
        <span className="chat-attachment-code-meta">{attachmentLineLabel(t, attachment.lineCount)}</span>
        <div className="chat-attachment-code-actions">
          {level === 'preview' && canExpand && (
            <button type="button" className="chat-attachment-code-toggle" onClick={() => setLevel('collapsed')}>
              {t('authorChat.attachmentFull')}
            </button>
          )}
          <button type="button" className="chat-attachment-code-toggle" onClick={primaryAction}>
            {primaryLabel}
          </button>
        </div>
      </div>
      {level !== 'collapsed' && (
        <div className="chat-attachment-code-body">
          <pre><code className={`language-${attachment.language}`}>{visibleContent}</code></pre>
          {level === 'preview' && canExpand && (
            <div className="chat-attachment-code-fade">{attachmentLineLabel(t, lines.length - 5)}</div>
          )}
        </div>
      )}
    </div>
  )
}

function UserMessageContent({ msg, t }) {
  const { text, attachments } = messageDisplayParts(msg)
  const hasText = Boolean(text)
  const hasAttachments = attachments.length > 0

  if (!hasAttachments) {
    return (
      <div className="user-message-bubble">
        {visibleUserMessageContent(msg) || t('authorChat.sentAttachment')}
      </div>
    )
  }

  return (
    <div className="user-message-stack">
      {hasText && (
        <div className="user-message-bubble">
          {visibleUserMessageContent(msg)}
        </div>
      )}
      {attachments.map((attachment, index) => (
        <AttachmentCodeBlock key={`${attachment.name}-${index}`} attachment={attachment} t={t} />
      ))}
    </div>
  )
}

export function MessageBubble({ msg, onOptionSelect, optionsDisabled, onCheckpointEdit, checkpointEditDisabled }) {
  const { t } = useI18n()
  const isUser = msg.role === 'user'
  const canEditCheckpoint = isUser && msg.id && msg.checkpoint_id && !checkpointEditDisabled

  return (
    <div className={`chat-message-row chat-message-enter ${isUser ? 'is-user' : 'is-assistant'}`}>
      {canEditCheckpoint && (
        <div className="chat-message-meta chat-message-actions">
          <button
            type="button"
            onClick={() => onCheckpointEdit?.(msg)}
            title="编辑并从这里重新运行"
            className="checkpoint-edit-button"
          >
            <Pencil size={10} />
          </button>
        </div>
      )}

      {!isUser && msg.segments ? (
        <div className="assistant-segment-stack">
          {msg.thinking && !msg.segments.some(s => s.type === 'thinking') && (
            <ThinkingCard segment={{ text: msg.thinking }} t={t} />
          )}
          {groupAssistantSegments(msg.segments).map((seg, i) => (
            seg.type === 'tool_group' ? (
              <ToolActivityGroup key={i} segments={seg.segments} />
            ) : seg.type === 'content' ? (
              <div key={i} className="markdown-chat assistant-message-bubble">
                <MarkdownContent>{seg.text}</MarkdownContent>
              </div>
            ) : seg.type === 'thinking' ? (
              <ThinkingCard key={i} segment={seg} t={t} />
            ) : seg.type === 'options' ? (
              <OptionsCard key={i} segment={seg} disabled={optionsDisabled} onSelect={onOptionSelect} />
            ) : null
          ))}
        </div>
      ) : isUser ? (
        <UserMessageContent msg={msg} t={t} />
      ) : (
        <div className="markdown-chat assistant-message-bubble">
          <MarkdownContent>{msg.content}</MarkdownContent>
        </div>
      )}
    </div>
  )
}
