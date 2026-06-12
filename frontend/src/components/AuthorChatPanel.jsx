import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Plus, X, FileText, PenTool, Loader, Square, Paperclip, Gamepad2, Check, ArrowDown } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { MessageBubble, OptionsCard, ThinkingCard, ToolActivityGroup } from './author-chat/MessageCards'
import { MarkdownContent } from './author-chat/MarkdownContent'
import {
  applyStreamingPreview,
  latestStreamingContentTarget,
  nextTypewriterFrame,
} from './author-chat/typewriter'
import { CHAT_MODES, normalizeChatMode } from './author-chat/chatModes'
import {
  DATA_MUTATING_TOOLS,
  editableUserMessageContent,
  hasAssistantReplyAfterUser,
  isCheckpointEditorActiveForMessage,
  persistDraftInput,
  restoreDraftInput,
  sentHistoryFromMessages,
  shouldSubmitComposerKey,
  truncateMessagesBeforeCheckpoint,
} from './author-chat/messageUtils'
import { fetchChatHistory } from './author-chat/historyLoader'
import { parseSlashCommand } from './author-chat/slashCommands'
import { agentLifecycleState } from './author-chat/agentState'
import { groupAssistantSegments } from './author-chat/toolActivity'
import { buildAuthorChatRequestBody } from './author-chat/requestPayload'

const CHAT_MODE_STORAGE_KEY = 'inkflow.chatMode'

function readInitialChatMode() {
  if (typeof window === 'undefined') return 'author'
  try {
    return normalizeChatMode(window.localStorage.getItem(CHAT_MODE_STORAGE_KEY))
  } catch {
    return 'author'
  }
}

function CheckpointEditComposer({ value, onChange, onCancel, onSubmit, disabled }) {
  const { t } = useI18n()
  const composingRef = useRef(false)
  const compositionJustEndedRef = useRef(false)
  const submit = () => {
    if (!disabled && value.trim()) onSubmit()
  }
  const handleCompositionStart = () => {
    composingRef.current = true
    compositionJustEndedRef.current = false
  }
  const handleCompositionEnd = () => {
    composingRef.current = false
    compositionJustEndedRef.current = true
    window.setTimeout(() => { compositionJustEndedRef.current = false }, 0)
  }

  return (
    <div style={{
      alignSelf: 'flex-end',
      width: 'min(520px, 85%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      border: '1px solid color-mix(in oklch, var(--accent) 35%, transparent)',
      background: 'color-mix(in oklch, var(--accent) 9%, var(--bg-elevated))',
    }}>
      <textarea
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={event => {
          if (shouldSubmitComposerKey(event, composingRef.current || compositionJustEndedRef.current)) {
            event.preventDefault()
            submit()
          }
        }}
        rows={3}
        autoFocus
        style={{
          width: '100%',
          resize: 'vertical',
          minHeight: 74,
          maxHeight: 180,
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          background: 'var(--bg)',
          color: 'var(--ink)',
          font: 'inherit',
          fontSize: 13,
          lineHeight: 1.55,
          padding: '8px 10px',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          title={t('authorChat.cancelEdit')}
          style={{
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--ink-secondary)',
            borderRadius: 7,
            padding: '6px 9px',
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
        >
          <X size={13} /> {t('authorChat.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          title={t('authorChat.rerunFromHere')}
          style={{
            border: 'none',
            background: value.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
            color: value.trim() ? 'white' : 'var(--ink-muted)',
            borderRadius: 7,
            padding: '6px 10px',
            cursor: disabled || !value.trim() ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Send size={13} /> {t('authorChat.resend')}
        </button>
      </div>
    </div>
  )
}

export function ComposerToolMenu({
  mode = 'author',
  onModeChange,
  onAttachFile,
  disabled = false,
  openByDefault = false,
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(openByDefault)
  const menuRef = useRef(null)
  const activeMode = normalizeChatMode(mode)

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const selectMode = (nextMode) => {
    onModeChange?.(normalizeChatMode(nextMode))
    setOpen(false)
  }

  const attachFile = () => {
    onAttachFile?.()
    setOpen(false)
  }

  return (
    <div className="chat-tool-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className={`btn-icon chat-tool-button${open ? ' is-open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        title={open ? t('authorChat.closeTools') : t('authorChat.openTools')}
        aria-label={open ? t('authorChat.closeTools') : t('authorChat.openTools')}
        aria-expanded={open}
        disabled={disabled}
      >
        <Plus size={17} />
      </button>
      {open && (
        <div className="chat-tool-menu" role="menu">
          <button
            type="button"
            className="chat-tool-menu-item chat-tool-menu-upload"
            onClick={attachFile}
            role="menuitem"
          >
            <Paperclip size={15} />
            <span>{t('authorChat.attachFile')}</span>
          </button>
          <div className="chat-tool-menu-divider" />
          <div className="chat-tool-menu-label">{t('authorChat.modeGroup')}</div>
          <div className="chat-mode-options">
            {CHAT_MODES.map(item => {
              const selected = item.id === activeMode
              const Icon = item.id === 'game_script' ? Gamepad2 : PenTool
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`chat-mode-option${selected ? ' active' : ''}`}
                  onClick={() => selectMode(item.id)}
                  aria-pressed={selected}
                  role="menuitemradio"
                >
                  <Icon size={15} />
                  <span>{t(item.labelKey)}</span>
                  {selected && <Check size={13} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AgentStateBadge({ phase }) {
  const state = agentLifecycleState(phase)
  return (
    <span className="agent-state-badge">
      <span className="agent-state-dot" />
      <span className="agent-state-copy">
        <span className="agent-state-token agent-shimmer">{state.token}</span>
        <span className="agent-state-label">{state.label}</span>
      </span>
    </span>
  )
}

export function LiveStreamingMessage({
  streamingMsg,
  visibleStreamingSegments,
  optionsDisabled,
  onOptionSelect,
  t,
  now = 0,
}) {
  if (!streamingMsg) return null

  return (
    <div className="streaming-message-shell chat-message-row chat-message-enter is-assistant">
      {!streamingMsg.retry && (
        <div className="streaming-agent-state-line">
          <AgentStateBadge phase={streamingMsg.phase} />
        </div>
      )}

      {streamingMsg.retry && (
        <div style={{
          maxWidth: '85%', padding: '6px 10px', borderRadius: 8, marginBottom: 4,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
          fontSize: 11, color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Loader size={11} style={{ animation: 'spin 1.5s linear infinite', color: '#f59e0b' }} />
          <span>
            {t('authorChat.retrying')
              .replace('{status}', streamingMsg.retry.status)
              .replace('{attempt}', streamingMsg.retry.attempt)}{' '}
            {(() => {
              const nowTs = now || streamingMsg.retry.startedAt || 0
              const elapsed = nowTs - (streamingMsg.retry.startedAt ?? nowTs)
              const remaining = Math.max(0, streamingMsg.retry.delayMs - elapsed)
              return remaining > 0
                ? t('authorChat.retryAfter').replace('{seconds}', (remaining / 1000).toFixed(1))
                : t('authorChat.retryNow')
            })()}
          </span>
        </div>
      )}

      {streamingMsg.segments?.length > 0 && (
        <div className="streaming-segments">
          {groupAssistantSegments(visibleStreamingSegments).map((seg, j) => (
            seg.type === 'tool_group' ? (
              <ToolActivityGroup key={j} segments={seg.segments} />
            ) : seg.type === 'content' ? (
              <div key={j} className="markdown-chat streaming-content-bubble">
                <MarkdownContent>{seg.text}</MarkdownContent>
                {seg.streaming && <span className="typewriter-caret" aria-hidden="true" />}
              </div>
            ) : seg.type === 'thinking' ? (
              <ThinkingCard key={j} segment={seg} t={t} />
            ) : seg.type === 'options' ? (
              <OptionsCard key={j} segment={seg} disabled={optionsDisabled} onSelect={onOptionSelect} />
            ) : null
          ))}
        </div>
      )}
    </div>
  )
}

export function NoBookChatStarter({
  onSubmitMessage,
  addToast,
  chatMode = 'author',
  onModeChange,
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)
  const composingRef = useRef(false)
  const compositionJustEndedRef = useRef(false)

  const submit = () => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    onSubmitMessage?.(text, { attachments })
    setDraft('')
    setAttachments([])
  }

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || [])
    files.forEach(file => {
      if (file.size > 512 * 1024) {
        addToast?.(t('authorChat.fileTooLarge').replace('{name}', file.name), 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = ev => {
        setAttachments(prev => [...prev, { name: file.name, content: ev.target.result, size: file.size, type: file.type || '' }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCompositionStart = () => {
    composingRef.current = true
    compositionJustEndedRef.current = false
  }

  const handleCompositionEnd = () => {
    composingRef.current = false
    compositionJustEndedRef.current = true
    window.setTimeout(() => { compositionJustEndedRef.current = false }, 0)
  }

  return (
    <div className="author-chat no-book-chat">
      <div className="chat-scroll">
        <div className="no-book-chat-card">
          <h2>{t('authorChat.noBookTitle')}</h2>
          <div className="no-book-suggestions">
            {[t('authorChat.suggestion1'), t('authorChat.suggestion2'), t('authorChat.suggestion3')].map(suggestion => (
              <button key={suggestion} type="button" onClick={() => setDraft(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chat-composer">
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <ComposerToolMenu
          mode={chatMode}
          onModeChange={onModeChange}
          onAttachFile={() => fileInputRef.current?.click()}
        />
        <ChatComposerBody attachments={attachments} onRemoveAttachment={removeAttachment}>
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={event => {
              if (shouldSubmitComposerKey(event, composingRef.current || compositionJustEndedRef.current)) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={t('authorChat.noBookPlaceholder')}
            rows={1}
          />
        </ChatComposerBody>
        <button
          type="button"
          className="chat-send-button"
          disabled={!draft.trim() && attachments.length === 0}
          onClick={submit}
          title={t('authorChat.send')}
          aria-label={t('authorChat.send')}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function AttachmentPreview({ attachments, onRemove }) {
  const { t } = useI18n()
  return (
    <div className="chat-attachment-preview">
      {attachments.map((a, i) => (
        <div key={i} className="chat-attachment-chip">
          <FileText size={11} />
          <span>{a.name}</span>
          <small>{(a.size / 1024).toFixed(1)}KB</small>
          <button type="button" onClick={() => onRemove(i)} aria-label={t('authorChat.removeAttachment')}>
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function ChatComposerBody({ attachments = [], onRemoveAttachment, children }) {
  return (
    <div className="chat-composer-body">
      {attachments.length > 0 && (
        <AttachmentPreview attachments={attachments} onRemove={onRemoveAttachment} />
      )}
      {children}
    </div>
  )
}

export function AuthorChatPanel({
  currentBook,
  addToast,
  onLoreUpdated,
  draftSessionId,
  onBookCreated,
}) {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [streamingMsg, setStreamingMsg] = useState(null) // {thinking, segments[], thinkingDone, phase}
  const [visibleStreamingText, setVisibleStreamingText] = useState('')
  const [checkpointEditor, setCheckpointEditor] = useState(null)
  const [checkpointResending, setCheckpointResending] = useState(false)
  const chatScrollRef = useRef(null)
  // Sticky-follow scrolling: only auto-scroll while the user is near the
  // bottom. The ref is the live source of truth for the follow loop; the
  // state mirrors it for rendering the "back to bottom" button.
  const stickToBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const composingRef = useRef(false)
  const compositionJustEndedRef = useRef(false)
  const [chatMode, setChatModeState] = useState(readInitialChatMode)
  // Up/Down arrow history navigation. histIdx is the offset back from the
  // newest sent message; null means "currently editing fresh input".
  const sentHistory = useRef([])  // newest last
  const [histIdx, setHistIdx] = useState(null)
  const draftBeforeNav = useRef('')

  const bookId = currentBook?.book_id || currentBook?.id
  const isUnboundSession = !bookId
  const activeSessionId = draftSessionId || 'session_default'
  const historyEndpoint = bookId
    ? `/api/v1/author-chat/${bookId}/history`
    : `/api/v1/author-chat/sessions/${activeSessionId}/history`
  const sendEndpoint = bookId
    ? `/api/v1/author-chat/${bookId}/send`
    : `/api/v1/author-chat/sessions/${activeSessionId}/send`
  const draftStorageKey = bookId
    ? `inkflow.authorChatDraft:${bookId}`
    : `inkflow.authorChatDraft:session:${activeSessionId}`
  const setChatMode = useCallback((mode) => {
    const nextMode = normalizeChatMode(mode)
    setChatModeState(nextMode)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, nextMode)
    } catch { /* ignore localStorage failures */ }
  }, [])
  const refreshAfterTool = useCallback((toolName) => {
    if (DATA_MUTATING_TOOLS.has(toolName)) {
      onLoreUpdated?.()
    }
  }, [onLoreUpdated])

  const loadChatHistory = useCallback(() => {
    if (!bookId && !activeSessionId) return
    return fetchChatHistory(historyEndpoint)
      .then(restored => {
        if (!restored) return null
        setMessages(restored)
        sentHistory.current = sentHistoryFromMessages(restored)
        setHistIdx(null)
        return restored
      })
      .catch(() => null)
  }, [activeSessionId, bookId, historyEndpoint])

  useEffect(() => { loadChatHistory() }, [loadChatHistory])

  useEffect(() => {
    setCheckpointEditor(null)
  }, [bookId])

  useEffect(() => {
    if (!draftStorageKey) {
      setInput('')
      return
    }
    setInput(restoreDraftInput(window.localStorage, draftStorageKey))
  }, [draftStorageKey])

  const updateInput = useCallback((value) => {
    setInput(value)
    if (!draftStorageKey) return
    persistDraftInput(window.localStorage, draftStorageKey, value)
  }, [draftStorageKey])

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 80
    stickToBottomRef.current = atBottom
    setIsAtBottom(atBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    stickToBottomRef.current = true
    setIsAtBottom(true)
  }, [])

  // Auto-scroll, but only while the user hasn't scrolled away from the
  // bottom. Direct scrollTop assignment (no smooth behavior) because this
  // fires per streamed token — smooth scrolling would queue up and judder.
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingMsg, visibleStreamingText])

  const streamingContentTarget = latestStreamingContentTarget(streamingMsg?.segments ?? [])
  const visibleStreamingSegments = streamingMsg
    ? applyStreamingPreview(streamingMsg.segments ?? [], visibleStreamingText)
    : []

  useEffect(() => {
    if (!streamingContentTarget) {
      setVisibleStreamingText('')
      return undefined
    }

    setVisibleStreamingText(current => nextTypewriterFrame(current, streamingContentTarget))
    const timer = window.setInterval(() => {
      setVisibleStreamingText(current => nextTypewriterFrame(current, streamingContentTarget))
    }, 24)

    return () => window.clearInterval(timer)
  }, [streamingContentTarget])

  // Tick once a second while a retry banner or heartbeat banner is showing, so
  // the displayed countdown / elapsed time stays live without a server push.
  // Holds a timestamp so children can render countdowns without reading the
  // clock during render.
  const [clockNow, setClockNow] = useState(0)
  useEffect(() => {
    if (!streamingMsg) return
    if (!streamingMsg.retry && !(streamingMsg.idleMs >= 15000)) return
    setClockNow(Date.now())
    const id = setInterval(() => setClockNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [streamingMsg])

  // File handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      if (file.size > 512 * 1024) {
        addToast?.(t('authorChat.fileTooLarge').replace('{name}', file.name), 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, { name: file.name, content: ev.target.result, size: file.size, type: file.type || '' }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSend = async (overrideMsg, options = {}) => {
    const fromOverride = typeof overrideMsg === 'string'
    const baseInput = fromOverride ? overrideMsg.trim() : input.trim()
    const outgoingAttachments = Array.isArray(options?.attachments)
      ? options.attachments
      : fromOverride ? [] : attachments
    const attachmentPayload = outgoingAttachments.map((attachment, index) => ({
      name: String(attachment.name || `file-${index + 1}`),
      size: Number(attachment.size || String(attachment.content ?? '').length || 0),
      content: String(attachment.content ?? ''),
      type: String(attachment.type || ''),
    }))
    const useAttachments = attachmentPayload.length > 0
    const replaceMessageId = options?.replaceMessageId
    if ((!baseInput && !useAttachments) || loading) return

    const slash = fromOverride || useAttachments ? null : parseSlashCommand(baseInput)
    if (slash) {
      updateInput('')
      setAttachments([])
      if (slash.type === 'remember') {
        try {
          const r = await fetch('/api/v1/memory/remember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: slash.text, scope: 'user', type: 'preference', tags: [] }),
          })
          if (r.ok) addToast?.(t('authorChat.remembered'), 'success')
          else addToast?.(t('authorChat.saveFailed'), 'error')
        } catch (e) {
          addToast?.(e.message, 'error')
        }
        return
      }
      if (slash.type === 'compact') {
        await handleCompact()
        return
      }
      if (slash.type === 'clear') {
        await handleClear({ clearInput: false })
        return
      }
    }

    const userMsg = baseInput
    // Push to in-memory recall ring (keep raw user text, not the attachment-suffixed version).
    if (baseInput) sentHistory.current.push(baseInput)
    setHistIdx(null)
    draftBeforeNav.current = ''
    if (!fromOverride) updateInput('')
    if (!fromOverride && useAttachments) setAttachments([])
    // Sending a message always re-engages bottom-follow, even if the user
    // had scrolled up — the auto-scroll effect lands after the new render.
    stickToBottomRef.current = true
    setIsAtBottom(true)
    setMessages(prev => [...prev, {
      role: 'user', content: userMsg,
      attachments: attachmentPayload,
    }])
    setLoading(true)
    setStreamingMsg({ thinking: '', segments: [], thinkingDone: false, phase: 'init', retry: null })

    abortRef.current = new AbortController()
    try {
      const resp = await fetch(sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAuthorChatRequestBody({
          message: userMsg,
          attachments: useAttachments ? attachmentPayload : [],
          mode: chatMode,
          replaceMessageId,
        })),
        signal: abortRef.current.signal,
      })
      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(() => '')
        throw new Error(detail || `HTTP ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      // Segment-based accumulation. Thinking is now segments too — each step
      // gets its own block (delimited server-side by REASONING_OPEN/CLOSE
      // markers and announced via thinking_start / thinking_done events).
      let segments = []
      let currentContentBuf = ''
      let createdBookFromStream = null

      const flushContent = () => {
        if (currentContentBuf.trim()) {
          segments.push({ type: 'content', text: currentContentBuf })
          currentContentBuf = ''
        }
      }
      const appendToLatestThinking = (text) => {
        // Append to the last segment if it's a streaming thinking block;
        // otherwise (e.g., we missed thinking_start) create one.
        const last = segments[segments.length - 1]
        if (last && last.type === 'thinking' && last.streaming) {
          last.text += text
        } else {
          flushContent()
          segments.push({ type: 'thinking', text, streaming: true })
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))

            if (evt.type === 'status') {
              setStreamingMsg(prev => ({ ...prev, phase: evt.phase }))
            } else if (evt.type === 'retry') {
              // Stamp `retryStartedAt` so the UI can tick down delayMs in real time
              // (the server only emits one retry event per attempt).
              setStreamingMsg(prev => ({
                ...prev,
                retry: { attempt: evt.attempt, delayMs: evt.delay_ms, status: evt.status, reason: evt.reason, startedAt: Date.now() },
                idleMs: 0,
              }))
            } else if (evt.type === 'heartbeat') {
              setStreamingMsg(prev => ({ ...prev, idleMs: evt.idle_ms }))
            } else if (evt.type === 'tip') {
              addToast?.(`${evt.title}：${evt.message}`, evt.severity === 'warning' ? 'warning' : 'info')
            } else if (evt.type === 'book_created') {
              createdBookFromStream = evt.book
            } else if (evt.type === 'thinking_start') {
              flushContent()
              segments.push({ type: 'thinking', text: '', streaming: true })
              setStreamingMsg(prev => ({ ...prev, segments: [...segments], retry: null, idleMs: 0 }))
            } else if (evt.type === 'thinking_done') {
              const last = segments[segments.length - 1]
              if (last && last.type === 'thinking') last.streaming = false
              setStreamingMsg(prev => ({ ...prev, segments: [...segments] }))
            } else if (evt.type === 'thinking') {
              appendToLatestThinking(evt.token)
              setStreamingMsg(prev => ({ ...prev, segments: [...segments], retry: null, idleMs: 0 }))
            } else if (evt.type === 'content') {
              currentContentBuf += evt.token
              // Update segments for live display
              const liveSegments = [...segments, { type: 'content', text: currentContentBuf, streaming: true }]
              setStreamingMsg(prev => ({
                ...prev, segments: liveSegments, retry: null, idleMs: 0
              }))
            } else if (evt.type === 'options') {
              flushContent()
              segments.push({ type: 'options', description: evt.description || '', options: evt.options || [] })
              setStreamingMsg(prev => ({ ...prev, segments: [...segments] }))
            } else if (evt.type === 'tool_start') {
              flushContent()
              segments.push({
                type: 'tool_call', name: evt.name, status: 'running',
                argsPreview: evt.args_preview || ''
              })
              setStreamingMsg(prev => ({ ...prev, segments: [...segments] }))
            } else if (evt.type === 'tool_done') {
              // Update the last matching running tool
              for (let i = segments.length - 1; i >= 0; i--) {
                if (segments[i].type === 'tool_call' && segments[i].name === evt.name && segments[i].status === 'running') {
                  segments[i] = { ...segments[i], status: 'done', result: evt.result_preview || '' }
                  break
                }
              }
              setStreamingMsg(prev => ({ ...prev, segments: [...segments] }))
              refreshAfterTool(evt.name)
            } else if (evt.type === 'error') {
              currentContentBuf += `${t('authorChat.error')}: ${evt.message}`
              setStreamingMsg(prev => ({
                ...prev, segments: [...segments, { type: 'content', text: currentContentBuf }]
              }))
            } else if (evt.type === 'context') {
              // Context-manager decision from the backend. Surface decay / cold-compact
              // actions as inline system notices so the user understands why earlier
              // turns may look trimmed or summarized. Pure info — no state mutation.
              const d = evt.decision ?? evt
              if (d.decayedCount > 0) {
                setMessages(prev => [...prev, {
                  id: `ctx_dec_${Date.now()}`,
                  role: 'system_notice',
                  content: t('authorChat.contextDecayed').replace('{count}', d.decayedCount),
                }])
              }
              if (d.compactedCount > 0) {
                setMessages(prev => [...prev, {
                  id: `ctx_cp_${Date.now()}`,
                  role: 'system_notice',
                  content: t('authorChat.contextCompacted').replace('{count}', d.compactedCount),
                }])
              }
            } else if (evt.type === 'done') {
              // Stream complete — refresh lore if tools were used
              if (evt.tools_used?.length > 0 && onLoreUpdated) {
                onLoreUpdated()
              }
            }
          } catch { /* SSE parse error — skip malformed event */ }
        }
      }

      // Flush remaining content + finalize any still-streaming thinking
      flushContent()
      const tail = segments[segments.length - 1]
      if (tail && tail.type === 'thinking') tail.streaming = false

      // Commit the final message
      const msgId = Date.now()
      setMessages(prev => [...prev, {
        role: 'assistant',
        segments: segments.length > 0 ? segments : [{ type: 'content', text: t('authorChat.noReply') }],
        id: msgId
      }])
      if (createdBookFromStream?.book_id) {
        onBookCreated?.(createdBookFromStream)
      } else {
        await loadChatHistory()
      }

    } catch (e) {
      if (e.name === 'AbortError') {
        addToast?.(t('authorChat.cancelledSaved'), 'info')
        await loadChatHistory()  // pick up the server-side aborted message
      } else {
        const recovered = await loadChatHistory()
        if (!hasAssistantReplyAfterUser(recovered, userMsg)) {
          addToast?.(t('authorChat.sendFailed') + ': ' + e.message, 'error')
        }
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStreamingMsg(null)
      inputRef.current?.focus()
    }
  }

  const openCheckpointEditor = (msg) => {
    if (loading || checkpointResending || !msg?.id || !msg?.checkpoint_id) return
    setCheckpointEditor({
      messageId: msg.id,
      checkpointId: msg.checkpoint_id,
      draft: editableUserMessageContent(msg),
    })
  }

  const updateCheckpointDraft = (draft) => {
    setCheckpointEditor(prev => prev ? { ...prev, draft } : prev)
  }

  const handleCheckpointResend = async () => {
    if (!bookId || loading || checkpointResending || !checkpointEditor) return
    const replacement = checkpointEditor.draft.trim()
    if (!replacement) return
    try {
      setCheckpointResending(true)
      const resp = await fetch(`/api/v1/books/${bookId}/checkpoints/${checkpointEditor.checkpointId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: checkpointEditor.messageId,
          replacement_message: replacement,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || data.message || 'restore failed')

      setMessages(prev => truncateMessagesBeforeCheckpoint(prev, checkpointEditor.messageId))
      setCheckpointEditor(null)
      onLoreUpdated?.()
      await handleSend(replacement, { replaceMessageId: checkpointEditor.messageId })
    } catch (e) {
      addToast?.(t('authorChat.resendFailed').replace('{message}', e.message), 'error')
    } finally {
      setCheckpointResending(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleCompact = async () => {
    if (!bookId || loading) {
      if (!bookId) addToast?.(t('authorChat.unboundCompactHint'), 'info')
      return
    }
    try {
      const r = await fetch(`/api/v1/books/${bookId}/session/compact`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || data.message || 'compact failed')
      const hasCount = data.compactedCount !== undefined && data.compactedCount !== null
      const notice = hasCount
        ? `${t('authorChat.manualCompact').replace('{count}', data.compactedCount)}${data.message ? ` (${data.message})` : ''}`
        : (data.message || t('authorChat.manualCompact').replace('{count}', '0'))
      setMessages(prev => [...prev, {
        id: `manual_compact_${Date.now()}`,
        role: 'system_notice',
        content: notice,
      }])
      addToast?.(data.message || t('authorChat.contextCompactedSuccess'), 'success')
    } catch (e) {
      addToast?.(t('authorChat.compactFailed').replace('{message}', e.message), 'error')
    }
  }

  const handleClear = async (options = {}) => {
    const clearInput = options?.clearInput !== false
    try {
      const r = await fetch(historyEndpoint, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || data.message || 'clear failed')
      setMessages([])
      setHistIdx(null)
      setCheckpointEditor(null)
      sentHistory.current = []
      draftBeforeNav.current = ''
      if (clearInput) updateInput('')
      return true
    } catch (e) {
      addToast?.(t('authorChat.clearFailed').replace('{message}', e.message), 'error')
      return false
    }
  }

  const handleCompositionStart = () => {
    composingRef.current = true
    compositionJustEndedRef.current = false
  }

  const handleCompositionEnd = () => {
    composingRef.current = false
    compositionJustEndedRef.current = true
    window.setTimeout(() => { compositionJustEndedRef.current = false }, 0)
  }

  const handleKeyDown = (e) => {
    if (shouldSubmitComposerKey(e, composingRef.current || compositionJustEndedRef.current)) {
      e.preventDefault()
      handleSend()
      return
    }
    // Up/Down recall, only when the input is single-line empty OR we are
    // already navigating history (so multi-line edits aren't disrupted).
    const hist = sentHistory.current
    const navigating = histIdx !== null
    const empty = !input
    if ((e.key === 'ArrowUp') && (empty || navigating) && hist.length > 0) {
      e.preventDefault()
      const next = histIdx === null ? hist.length - 1 : Math.max(0, histIdx - 1)
      if (histIdx === null) draftBeforeNav.current = input
      setHistIdx(next)
      updateInput(hist[next])
      return
    }
    if ((e.key === 'ArrowDown') && navigating) {
      e.preventDefault()
      const next = histIdx + 1
      if (next >= hist.length) {
        setHistIdx(null)
        updateInput(draftBeforeNav.current)
      } else {
        setHistIdx(next)
        updateInput(hist[next])
      }
      return
    }
  }

  if (isUnboundSession && messages.length === 0 && !streamingMsg) {
    return (
      <NoBookChatStarter
        onSubmitMessage={(text, options) => handleSend(text, options)}
        addToast={addToast}
        chatMode={chatMode}
        onModeChange={setChatMode}
      />
    )
  }

  return (
    <div className="author-chat">
      {/* Header */}
      <div className="author-chat-header">
        <div className="author-chat-title">
          <span>{t('authorChat.agentTitle')}</span>
          <span className="author-chat-tool-summary">
            {t('authorChat.toolSummary')}
          </span>
        </div>
        <div className="author-chat-actions">
          <button className="btn-icon author-chat-clear-button" onClick={handleClear} title={t('authorChat.clear')}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="author-chat-scroll-wrap">
      <div className="author-chat-scroll" ref={chatScrollRef} onScroll={handleChatScroll}>
        {messages.length === 0 && !streamingMsg && (
          <div className="author-chat-empty">
            <div>{t('authorChat.directChat')}</div>
            <div>{t('authorChat.capabilities')}</div>
            <div>{t('authorChat.features')}</div>
          </div>
        )}

        {/* Committed messages */}
        {messages.map((msg, i) => {
          // Context-manager notices (decay / cold-compact) render as a slim
          // centered line rather than a chat bubble — they're metadata, not speech.
          if (msg.role === 'system_notice') {
            return <div key={msg.id || i} className="context-notice">{msg.content}</div>
          }
          const isEditingCheckpoint = isCheckpointEditorActiveForMessage(checkpointEditor, msg)
          return (
            <div key={msg.id || i} style={{ display: 'contents' }}>
              <MessageBubble
                msg={msg}
                onOptionSelect={(opt) => handleSend(opt)}
                optionsDisabled={loading}
                onCheckpointEdit={openCheckpointEditor}
                checkpointEditDisabled={loading || checkpointResending || Boolean(streamingMsg)}
              />
              {isEditingCheckpoint && (
                <CheckpointEditComposer
                  value={checkpointEditor.draft}
                  onChange={updateCheckpointDraft}
                  onCancel={() => setCheckpointEditor(null)}
                  onSubmit={handleCheckpointResend}
                  disabled={loading || checkpointResending}
                />
              )}
            </div>
          )
        })}

        {/* Live streaming message */}
        {streamingMsg && (
          <LiveStreamingMessage
            streamingMsg={streamingMsg}
            visibleStreamingSegments={visibleStreamingSegments}
            optionsDisabled={loading}
            onOptionSelect={(opt) => handleSend(opt)}
            t={t}
            now={clockNow}
          />
        )}

      </div>

      {/* Detached from bottom during streaming — offer a one-click way back */}
      {streamingMsg && !isAtBottom && (
        <button className="chat-jump-to-bottom" onClick={scrollToBottom}>
          <ArrowDown size={12} />
          {t('authorChat.backToBottom')}
        </button>
      )}
      </div>

      {/* Input */}
      <div className="chat-composer author-chat-composer">
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <ComposerToolMenu
          mode={chatMode}
          onModeChange={setChatMode}
          onAttachFile={() => fileInputRef.current?.click()}
          disabled={loading}
        />
        <ChatComposerBody attachments={attachments} onRemoveAttachment={removeAttachment}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => updateInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={t('authorChat.placeholder')} rows={1}
          />
        </ChatComposerBody>
        {loading ? (
          <button className="chat-send-button chat-stop-button" onClick={handleStop}
            title={t('authorChat.stopSaved')}
            aria-label={t('authorChat.stop')}
          >
            <Square size={12} fill="white" />
          </button>
        ) : (
          <button className="chat-send-button" onClick={handleSend}
            disabled={!input.trim() && attachments.length === 0}
            title={t('authorChat.send')}
            aria-label={t('authorChat.send')}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
