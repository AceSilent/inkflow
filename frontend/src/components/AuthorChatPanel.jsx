import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Plus, X, FileText, PenTool, Loader, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../hooks/useI18n'
import { ContextStatusBar } from './ContextStatusBar'
import { AgentRunTimeline } from './AgentRunTimeline'
import { CreativeStageBar } from './CreativeStageBar'
import { MessageBubble, OptionsCard, StreamingToolCard, ThinkingCard } from './author-chat/MessageCards'
import {
  DATA_MUTATING_TOOLS,
  buildAttachmentMessage,
  editableUserMessageContent,
  restoreChatMessages,
  sentHistoryFromMessages,
  truncateMessagesBeforeCheckpoint,
} from './author-chat/messageUtils'
import { parseSlashCommand } from './author-chat/slashCommands'
import { agentLifecycleState } from './author-chat/agentState'
import { deriveNewBookDraftFromPrompt } from './author-chat/newBookDraft'

function CheckpointEditComposer({ value, onChange, onCancel, onSubmit, disabled }) {
  const submit = () => {
    if (!disabled && value.trim()) onSubmit()
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
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
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
          title="取消编辑"
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
          <X size={13} /> 取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          title="从这里重新运行"
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
          <Send size={13} /> 重发
        </button>
      </div>
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

function ComposerModelSwitch({ authorModel, availableModels = [], onAuthorModelChange }) {
  const hasChoices = availableModels.length > 1

  if (hasChoices) {
    return (
      <select
        className="chat-model-select"
        value={authorModel}
        onChange={event => onAuthorModelChange?.(event.target.value)}
        aria-label="切换作者模型"
      >
        {availableModels.map(model => (
          <option key={model.value} value={model.value}>
            {model.provider ? `${model.provider} / ${model.label}` : model.label}
          </option>
        ))}
      </select>
    )
  }

  return <span className="chat-model-pill">{authorModel || '示例模式'}</span>
}

export function NoBookChatStarter({
  onCreateBookRequest,
  addToast,
  authorModel,
  availableModels,
  onAuthorModelChange,
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)

  const submit = () => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    const concept = attachments.length > 0
      ? buildAttachmentMessage(text || '根据附件创建作品', attachments, t('authorChat.attachment'))
      : text
    onCreateBookRequest?.(deriveNewBookDraftFromPrompt(concept))
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
        setAttachments(prev => [...prev, { name: file.name, content: ev.target.result, size: file.size }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="author-chat no-book-chat">
      <div className="chat-scroll">
        <div className="no-book-chat-card">
          <h2>{t('authorChat.noBookTitle')}</h2>
        </div>
      </div>
      {attachments.length > 0 && (
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
      )}
      <div className="chat-composer">
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <button type="button" className="btn-icon chat-tool-button" onClick={() => fileInputRef.current?.click()} title={t('authorChat.attachFile')}>
          <Plus size={17} />
        </button>
        <div className="chat-composer-body">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={t('authorChat.noBookPlaceholder')}
            rows={1}
          />
          <div className="chat-composer-meta">
            <span className="chat-mode-pill">作者模式</span>
            <ComposerModelSwitch
              authorModel={authorModel}
              availableModels={availableModels}
              onAuthorModelChange={onAuthorModelChange}
            />
          </div>
        </div>
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
  return (
    <div className="chat-attachment-preview">
      {attachments.map((a, i) => (
        <div key={i} className="chat-attachment-chip">
          <FileText size={11} />
          <span>{a.name}</span>
          <small>{(a.size / 1024).toFixed(1)}KB</small>
          <button type="button" onClick={() => onRemove(i)} aria-label="移除附件">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function AuthorChatPanel({
  currentBook,
  addToast,
  onLoreUpdated,
  onCreateBookRequest,
  authorModel,
  availableModels,
  onAuthorModelChange,
}) {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [streamingMsg, setStreamingMsg] = useState(null) // {thinking, segments[], thinkingDone, phase}
  const [checkpointEditor, setCheckpointEditor] = useState(null)
  const [checkpointResending, setCheckpointResending] = useState(false)
  const [recentRuns, setRecentRuns] = useState([])
  const [currentRun, setCurrentRun] = useState(null)
  const [stageRefreshKey, setStageRefreshKey] = useState(0)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const composingRef = useRef(false)
  // Up/Down arrow history navigation. histIdx is the offset back from the
  // newest sent message; null means "currently editing fresh input".
  const sentHistory = useRef([])  // newest last
  const [histIdx, setHistIdx] = useState(null)
  const draftBeforeNav = useRef('')

  const bookId = currentBook?.book_id
  const draftStorageKey = bookId ? `inkflow.authorChatDraft:${bookId}` : null
  const refreshAfterTool = useCallback((toolName) => {
    if (DATA_MUTATING_TOOLS.has(toolName)) {
      onLoreUpdated?.()
      setStageRefreshKey(k => k + 1)
    }
  }, [onLoreUpdated])

  const loadChatHistory = useCallback(() => {
    if (!bookId) return
    fetch(`/api/v1/author-chat/${bookId}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.messages) return
        const restored = restoreChatMessages(data.messages)
        setMessages(restored)
        sentHistory.current = sentHistoryFromMessages(restored)
        setHistIdx(null)
      })
      .catch(() => {})
  }, [bookId])

  useEffect(() => { loadChatHistory() }, [loadChatHistory])

  useEffect(() => {
    setCheckpointEditor(null)
  }, [bookId])

  useEffect(() => {
    if (!draftStorageKey) {
      setInput('')
      return
    }
    setInput(window.localStorage.getItem(draftStorageKey) || '')
  }, [draftStorageKey])

  const updateInput = useCallback((value) => {
    setInput(value)
    if (!draftStorageKey) return
    if (value) window.localStorage.setItem(draftStorageKey, value)
    else window.localStorage.removeItem(draftStorageKey)
  }, [draftStorageKey])

  const fetchRecentRuns = useCallback(() => {
    if (!bookId) return
    fetch(`/api/v1/books/${bookId}/runs/recent?limit=5`)
      .then(r => r.ok ? r.json() : { runs: [] })
      .then(data => setRecentRuns(data.runs || []))
      .catch(() => setRecentRuns([]))
  }, [bookId])

  useEffect(() => {
    setCurrentRun(null)
    fetchRecentRuns()
  }, [fetchRecentRuns])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMsg])

  // Tick once a second while a retry banner or heartbeat banner is showing, so
  // the displayed countdown / elapsed time stays live without a server push.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!streamingMsg) return
    if (!streamingMsg.retry && !(streamingMsg.idleMs >= 15000)) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
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
        setAttachments(prev => [...prev, { name: file.name, content: ev.target.result, size: file.size }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSend = async (overrideMsg, options = {}) => {
    const fromOverride = typeof overrideMsg === 'string' && overrideMsg.length > 0
    const baseInput = fromOverride ? overrideMsg : input.trim()
    const useAttachments = !fromOverride && attachments.length > 0
    const replaceMessageId = options?.replaceMessageId
    if ((!baseInput && !useAttachments) || loading || !bookId) return

    const slash = fromOverride ? null : parseSlashCommand(baseInput)
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
          if (r.ok) addToast?.('已记住', 'success')
          else addToast?.('保存失败', 'error')
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

    let userMsg = baseInput
    if (useAttachments) {
      userMsg = buildAttachmentMessage(baseInput, attachments, t('authorChat.attachment'))
    }

    const attachmentNames = useAttachments ? attachments.map(a => a.name) : []
    // Push to in-memory recall ring (keep raw user text, not the attachment-suffixed version).
    if (baseInput) sentHistory.current.push(baseInput)
    setHistIdx(null)
    draftBeforeNav.current = ''
    if (!fromOverride) updateInput('')
    if (useAttachments) setAttachments([])
    setMessages(prev => [...prev, {
      role: 'user', content: userMsg,
      hasAttachments: attachmentNames.length > 0, attachmentNames
    }])
    setLoading(true)
    setStreamingMsg({ thinking: '', segments: [], thinkingDone: false, phase: 'init', retry: null })
    setCurrentRun(null)

    abortRef.current = new AbortController()
    try {
      const resp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          ...(replaceMessageId ? { replace_message_id: replaceMessageId } : {}),
        }),
        signal: abortRef.current.signal,
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      // Segment-based accumulation. Thinking is now segments too — each step
      // gets its own block (delimited server-side by REASONING_OPEN/CLOSE
      // markers and announced via thinking_start / thinking_done events).
      let segments = []
      let currentContentBuf = ''

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
            } else if (evt.type === 'timeline') {
              const event = evt.event
              if (event?.runId) {
                setCurrentRun(prev => {
                  const base = prev?.runId === event.runId ? prev : {
                    runId: event.runId,
                    startedAt: event.ts,
                    status: 'running',
                    events: [],
                  }
                  const events = [...(base.events || []).filter(e => e.seq !== event.seq), event]
                    .sort((a, b) => a.seq - b.seq)
                  const terminal = [...events].reverse().find(e => e.type === 'run_done' || e.type === 'run_error' || e.type === 'run_aborted' || e.type === 'run_interrupted')
                  return {
                    ...base,
                    status: terminal?.status || event.status || 'running',
                    endedAt: terminal?.ts || base.endedAt,
                    events,
                  }
                })
              }
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
                  content: `本轮衰减了 ${d.decayedCount} 条工具结果（节省 token）`,
                }])
              }
              if (d.compactedCount > 0) {
                setMessages(prev => [...prev, {
                  id: `ctx_cp_${Date.now()}`,
                  role: 'system_notice',
                  content: `已压缩 ${d.compactedCount} 条早期消息到会话摘要`,
                }])
              }
            } else if (evt.type === 'done') {
              // Stream complete — refresh lore if tools were used
              if (evt.tools_used?.length > 0 && onLoreUpdated) {
                onLoreUpdated()
              }
              setStageRefreshKey(k => k + 1)
              fetchRecentRuns()
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

    } catch (e) {
      if (e.name === 'AbortError') {
        addToast?.('已取消，已生成的内容已保存', 'info')
        loadChatHistory()  // pick up the server-side aborted message
      } else {
        addToast?.(t('authorChat.sendFailed') + ': ' + e.message, 'error')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStreamingMsg(null)
      setStageRefreshKey(k => k + 1)
      fetchRecentRuns()
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
      setCurrentRun(null)
      setRecentRuns([])
      onLoreUpdated?.()
      setStageRefreshKey(k => k + 1)
      await handleSend(replacement, { replaceMessageId: checkpointEditor.messageId })
    } catch (e) {
      addToast?.(`重发失败：${e.message}`, 'error')
    } finally {
      setCheckpointResending(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleCompact = async () => {
    if (!bookId || loading) return
    try {
      const r = await fetch(`/api/v1/books/${bookId}/session/compact`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || data.message || 'compact failed')
      const hasCount = data.compactedCount !== undefined && data.compactedCount !== null
      const notice = hasCount
        ? `已手动压缩上下文：${data.compactedCount} 条消息${data.message ? `（${data.message}）` : ''}`
        : (data.message || '已手动压缩上下文：0 条消息')
      setMessages(prev => [...prev, {
        id: `manual_compact_${Date.now()}`,
        role: 'system_notice',
        content: notice,
      }])
      addToast?.(data.message || '上下文已压缩', 'success')
    } catch (e) {
      addToast?.(`压缩失败：${e.message}`, 'error')
    }
  }

  const handleClear = async (options = {}) => {
    if (!bookId) return false
    const clearInput = options?.clearInput !== false
    try {
      const r = await fetch(`/api/v1/author-chat/${bookId}/history`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || data.message || 'clear failed')
      setMessages([])
      setCurrentRun(null)
      setRecentRuns([])
      setHistIdx(null)
      setCheckpointEditor(null)
      sentHistory.current = []
      draftBeforeNav.current = ''
      if (clearInput) updateInput('')
      return true
    } catch (e) {
      addToast?.(`清空失败：${e.message}`, 'error')
      return false
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent?.isComposing || composingRef.current) return
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

  if (!bookId) {
    return (
      <NoBookChatStarter
        onCreateBookRequest={onCreateBookRequest}
        addToast={addToast}
        authorModel={authorModel}
        availableModels={availableModels}
        onAuthorModelChange={onAuthorModelChange}
      />
    )
  }

  return (
    <div className="author-chat">
      <ContextStatusBar bookId={currentBook?.book_id} />
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PenTool size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>作者 Agent</span>
          <span style={{ fontSize: 10, color: 'var(--ink-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>
            22 tools · streaming
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button onClick={handleClear} title="清空对话"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: 4, borderRadius: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <AgentRunTimeline currentRun={currentRun} recentRuns={recentRuns} loading={loading} />
      <CreativeStageBar bookId={bookId} refreshKey={stageRefreshKey} loading={loading} />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !streamingMsg && (
          <div style={{ textAlign: 'center', color: 'var(--ink-muted)', marginTop: 40, fontSize: 13, lineHeight: 2 }}>
            <PenTool size={32} style={{ marginBottom: 8, color: 'var(--accent)' }} />
            <div>{t('authorChat.directChat')}</div>
            <div style={{ fontSize: 11 }}>{t('authorChat.capabilities')}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{t('authorChat.features')}</div>
          </div>
        )}

        {/* Committed messages */}
        {messages.map((msg, i) => {
          // Context-manager notices (decay / cold-compact) render as a slim
          // centered line rather than a chat bubble — they're metadata, not speech.
          if (msg.role === 'system_notice') {
            return <div key={msg.id || i} className="context-notice">{msg.content}</div>
          }
          const isEditingCheckpoint = checkpointEditor?.messageId === msg.id
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><PenTool size={9} /> {t('authorChat.author')}</div>

            {/* Idle heartbeat banner — server reports no LLM tokens for >15s. Cleared on next chunk. */}
            {!streamingMsg.retry && streamingMsg.idleMs >= 15000 && (
              <div style={{
                maxWidth: '85%', padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.30)',
                fontSize: 11, color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Loader size={11} style={{ animation: 'spin 1.5s linear infinite', color: '#3b82f6' }} />
                <span>等待 LLM 响应中… 已 {Math.round(streamingMsg.idleMs / 1000)}s（thinking + 长上下文较慢，请稍候）</span>
              </div>
            )}

            {/* Retry banner — shown while backing off; auto-cleared on first content/thinking chunk */}
            {streamingMsg.retry && (
              <div style={{
                maxWidth: '85%', padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
                fontSize: 11, color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Loader size={11} style={{ animation: 'spin 1.5s linear infinite', color: '#f59e0b' }} />
                <span>
                  服务繁忙（{streamingMsg.retry.status}），第 {streamingMsg.retry.attempt} 次重试中…{' '}
                  {(() => {
                    const elapsed = Date.now() - (streamingMsg.retry.startedAt ?? Date.now())
                    const remaining = Math.max(0, streamingMsg.retry.delayMs - elapsed)
                    return remaining > 0 ? `${(remaining / 1000).toFixed(1)}s 后再试` : '正在重试…'
                  })()}
                </span>
              </div>
            )}

            {/* Segments (interleaved thinking + content + tool calls) */}
            {streamingMsg.segments?.length > 0 ? (
              <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                {streamingMsg.segments.map((seg, j) => (
                  seg.type === 'content' ? (
                    <div key={j} className="markdown-chat" style={{
                      padding: '10px 14px', borderRadius: 12,
                      fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                      background: 'var(--bg-elevated)', color: 'var(--ink)',
                      borderBottomLeftRadius: 4,
                    }}>
                      <ReactMarkdown>{seg.text}</ReactMarkdown>
                      {seg.streaming && <span style={{ animation: 'pulse 1s infinite' }}>▍</span>}
                    </div>
                  ) : seg.type === 'thinking' ? (
                    <ThinkingCard key={j} segment={seg} t={t} />
                  ) : seg.type === 'tool_call' ? (
                    <StreamingToolCard key={j} segment={seg} />
                  ) : seg.type === 'options' ? (
                    <OptionsCard key={j} segment={seg} disabled={loading} onSelect={(opt) => handleSend(opt)} />
                  ) : null
                ))}
              </div>
            ) : (
              <div style={{
                padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
                fontSize: 13, color: 'var(--ink-muted)', borderBottomLeftRadius: 4,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <AgentStateBadge phase={streamingMsg.phase} />
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Attachment Preview */}
      {attachments.length > 0 && <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />}

      {/* Input */}
      <div className="chat-composer author-chat-composer">
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <button className="btn-icon chat-tool-button" onClick={() => fileInputRef.current?.click()} title={t('authorChat.attachFile')}>
          <Plus size={17} />
        </button>
        <div className="chat-composer-body">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => updateInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            placeholder={t('authorChat.placeholder')} rows={1}
          />
          <div className="chat-composer-meta">
            <span className="chat-mode-pill">作者模式</span>
            <ComposerModelSwitch
              authorModel={authorModel}
              availableModels={availableModels}
              onAuthorModelChange={onAuthorModelChange}
            />
          </div>
        </div>
        {loading ? (
          <button className="chat-send-button chat-stop-button" onClick={handleStop}
            title="停止生成（已生成的内容会保存）"
            aria-label="停止生成"
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
