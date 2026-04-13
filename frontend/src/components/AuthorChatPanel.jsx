import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Wrench, Paperclip, X, FileText, ChevronDown, ChevronRight, Brain, PenTool, User, Loader, Check, History, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../hooks/useI18n'

export function AuthorChatPanel({ currentBook, addToast, onLoreUpdated }) {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [streamingMsg, setStreamingMsg] = useState(null) // {thinking, segments[], thinkingDone, phase}
  const [expandedThinking, setExpandedThinking] = useState({})
  const [snapshots, setSnapshots] = useState([])
  const [snapsOpen, setSnapsOpen] = useState(false)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)

  const bookId = currentBook?.book_id

  const loadChatHistory = useCallback(() => {
    if (!bookId) return
    fetch(`/api/v1/author-chat/${bookId}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.messages) return
        const thinkingState = {}
        const restored = data.messages.map((m, i) => {
          const id = m.id || Date.now() + i
          const out = { ...m, id }
          if (m.role === 'user' && m.content?.includes('\n\n--- 附件:')) {
            const parts = m.content.split('\n\n--- 附件:')
            const names = parts.slice(1).map(p => {
              const match = p.match(/^([^\n(]+)/)
              return match ? match[1].trim() : 'file'
            })
            out.hasAttachments = true
            out.attachmentNames = names
          }
          if (m.thinking) {
            thinkingState[id] = false
          }
          // Convert legacy format to segments if needed
          if (m.role === 'assistant' && !m.segments) {
            out.segments = []
            if (m.tool_calls?.length > 0) {
              m.tool_calls.forEach(t => {
                const toolName = typeof t === 'string' ? t : t.name
                out.segments.push({ type: 'tool_call', name: toolName, status: 'done' })
              })
            }
            if (m.content) {
              out.segments.push({ type: 'content', text: m.content })
            }
          }
          return out
        })
        setMessages(restored)
        setExpandedThinking(prev => ({ ...prev, ...thinkingState }))
      })
      .catch(() => {})
  }, [bookId])

  useEffect(() => { loadChatHistory() }, [loadChatHistory])

  const fetchSnapshots = useCallback(() => {
    if (!bookId) return
    fetch(`/api/v1/books/${bookId}/snapshots`)
      .then(r => r.ok ? r.json() : { snapshots: [] })
      .then(data => setSnapshots(data.snapshots || []))
      .catch(() => setSnapshots([]))
  }, [bookId])

  const handleRestoreSnapshot = async (snapId, label) => {
    if (!bookId) return
    if (!window.confirm(`回滚到该快照？将覆盖当前所有内容（含对话、大纲、设定、草稿）。\n\n快照：${label}`)) return
    try {
      const resp = await fetch(`/api/v1/books/${bookId}/snapshots/${snapId}/restore`, { method: 'POST' })
      if (!resp.ok) throw new Error('restore failed')
      addToast?.('已回滚到快照', 'success')
      setSnapsOpen(false)
      loadChatHistory()
      onLoreUpdated?.()  // bump dataVersion → other panels (outline / lore / plot tree) refresh
    } catch (e) {
      addToast?.('回滚失败：' + e.message, 'error')
    }
  }

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

  const handleSend = async (overrideMsg) => {
    const fromOverride = typeof overrideMsg === 'string' && overrideMsg.length > 0
    const baseInput = fromOverride ? overrideMsg : input.trim()
    const useAttachments = !fromOverride && attachments.length > 0
    if ((!baseInput && !useAttachments) || loading || !bookId) return

    let userMsg = baseInput
    if (useAttachments) {
      const fileParts = attachments.map(a =>
        `\n\n--- ${t('authorChat.attachment')}: ${a.name} (${(a.size / 1024).toFixed(1)}KB) ---\n${a.content}`
      ).join('')
      userMsg = userMsg + fileParts
    }

    const attachmentNames = useAttachments ? attachments.map(a => a.name) : []
    if (!fromOverride) setInput('')
    if (useAttachments) setAttachments([])
    setMessages(prev => [...prev, {
      role: 'user', content: userMsg,
      hasAttachments: attachmentNames.length > 0, attachmentNames
    }])
    setLoading(true)
    setStreamingMsg({ thinking: '', segments: [], thinkingDone: false, phase: 'init', retry: null })

    abortRef.current = new AbortController()
    try {
      const resp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
        signal: abortRef.current.signal,
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let finalThinking = ''
      // Segment-based accumulation
      let segments = []
      let currentContentBuf = ''

      const flushContent = () => {
        if (currentContentBuf.trim()) {
          segments.push({ type: 'content', text: currentContentBuf })
          currentContentBuf = ''
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
              addToast?.(`💡 ${evt.title}：${evt.message}`, evt.severity === 'warning' ? 'warning' : 'info')
            } else if (evt.type === 'thinking') {
              finalThinking += evt.token
              // First successful chunk after a retry — clear the retry banner.
              setStreamingMsg(prev => ({ ...prev, thinking: prev.thinking + evt.token, thinkingDone: false, retry: null, idleMs: 0 }))
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
            } else if (evt.type === 'error') {
              currentContentBuf += `${t('authorChat.error')}: ${evt.message}`
              setStreamingMsg(prev => ({
                ...prev, segments: [...segments, { type: 'content', text: currentContentBuf }]
              }))
            } else if (evt.type === 'done') {
              // Stream complete — refresh lore if tools were used
              if (evt.tools_used?.length > 0 && onLoreUpdated) {
                onLoreUpdated()
              }
            }
          } catch { /* SSE parse error — skip malformed event */ }
        }
      }

      // Flush remaining content
      flushContent()

      // Commit the final message
      const msgId = Date.now()
      setMessages(prev => [...prev, {
        role: 'assistant',
        segments: segments.length > 0 ? segments : [{ type: 'content', text: t('authorChat.noReply') }],
        thinking: finalThinking,
        id: msgId
      }])
      if (finalThinking) {
        setExpandedThinking(prev => ({ ...prev, [msgId]: false }))
      }

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
      inputRef.current?.focus()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleClear = async () => {
    if (!bookId) return
    await fetch(`/api/v1/author-chat/${bookId}/history`, { method: 'DELETE' })
    setMessages([])
    setExpandedThinking({})
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleThinking = (msgId) => {
    setExpandedThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  if (!bookId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
        {t('authorChat.noBook')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PenTool size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>作者 Agent</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>
            17 tools · streaming
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button
            onClick={() => { fetchSnapshots(); setSnapsOpen(s => !s) }}
            title="快照 / 回滚"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}
          >
            <History size={14} />
          </button>
          {snapsOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10,
              minWidth: 320, maxWidth: 420, maxHeight: 360, overflowY: 'auto',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 6,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px 6px' }}>
                快照（最近 {snapshots.length} 个，最多保留 10 个）
              </div>
              {snapshots.length === 0 && (
                <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  暂无快照（每次发消息前会自动创建）
                </div>
              )}
              {snapshots.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleRestoreSnapshot(s.id, s.label)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: 2,
                    border: '1px solid transparent', borderRadius: 6, background: 'transparent',
                    cursor: 'pointer', color: 'var(--text-primary)', gap: 2,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.30)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: 12, lineHeight: 1.4, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {s.label || '(无内容)'}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button onClick={handleClear} title="清空对话"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !streamingMsg && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13, lineHeight: 2 }}>
            <PenTool size={32} style={{ marginBottom: 8, color: 'var(--accent)' }} />
            <div>{t('authorChat.directChat')}</div>
            <div style={{ fontSize: 11 }}>{t('authorChat.capabilities')}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{t('authorChat.features')}</div>
          </div>
        )}

        {/* Committed messages */}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id || i}
            msg={msg}
            isExpanded={expandedThinking[msg.id]}
            onToggleThinking={() => toggleThinking(msg.id)}
            onOptionSelect={(opt) => handleSend(opt)}
            optionsDisabled={loading}
          />
        ))}

        {/* Live streaming message */}
        {streamingMsg && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><PenTool size={9} /> {t('authorChat.author')}</div>

            {/* Idle heartbeat banner — server reports no LLM tokens for >15s. Cleared on next chunk. */}
            {!streamingMsg.retry && streamingMsg.idleMs >= 15000 && (
              <div style={{
                maxWidth: '85%', padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.30)',
                fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6,
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
                fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6,
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

            {/* Thinking */}
            {streamingMsg.thinking && (
              <div style={{
                maxWidth: '85%', padding: '8px 12px', borderRadius: 10, marginBottom: 4,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
                border: '1px solid rgba(139,92,246,0.15)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 200, overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontSize: 10, fontWeight: 600, color: 'rgba(139,92,246,0.8)' }}>
                  <Brain size={10} /> {t('authorChat.thinking')}
                </div>
                {streamingMsg.thinking}
              </div>
            )}

            {/* Segments (interleaved content + tool calls) */}
            {streamingMsg.segments?.length > 0 ? (
              <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                {streamingMsg.segments.map((seg, j) => (
                  seg.type === 'content' ? (
                    <div key={j} className="markdown-chat" style={{
                      padding: '10px 14px', borderRadius: 12,
                      fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                      borderBottomLeftRadius: 4,
                    }}>
                      <ReactMarkdown>{seg.text}</ReactMarkdown>
                      {seg.streaming && <span style={{ animation: 'pulse 1s infinite' }}>▍</span>}
                    </div>
                  ) : seg.type === 'tool_call' ? (
                    <StreamingToolCard key={j} segment={seg} />
                  ) : seg.type === 'options' ? (
                    <OptionsCard key={j} segment={seg} disabled={loading} onSelect={(opt) => handleSend(opt)} />
                  ) : null
                ))}
              </div>
            ) : !streamingMsg.thinking && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
                fontSize: 13, color: 'var(--text-muted)', borderBottomLeftRadius: 4,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <Loader size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
                {streamingMsg.phase === 'agent_loop' && t('authorChat.thinking')}
                {!streamingMsg.phase && t('authorChat.processing')}
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div style={{
          padding: '6px 16px', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--bg-elevated)'
        }}>
          {attachments.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              borderRadius: 6, background: 'var(--bg-surface)', fontSize: 11,
              border: '1px solid var(--border-subtle)'
            }}>
              <FileText size={11} style={{ color: 'var(--accent)' }} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{(a.size / 1024).toFixed(1)}KB</span>
              <button onClick={() => removeAttachment(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0
      }}>
        <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} title={t('authorChat.attachFile')}
          style={{
            background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center'
          }}>
          <Paperclip size={16} />
        </button>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={t('authorChat.placeholder')} rows={1}
          style={{
            flex: 1, resize: 'none', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        {loading ? (
          <button onClick={handleStop}
            title="停止生成（已生成的内容会保存）"
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#ef4444', color: 'white',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600,
            }}>
            <Square size={12} fill="white" /> 停止
          </button>
        ) : (
          <button onClick={handleSend}
            disabled={!input.trim() && attachments.length === 0}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: (input.trim() || attachments.length > 0) ? 'var(--accent)' : 'var(--bg-elevated)',
              color: (input.trim() || attachments.length > 0) ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, transition: 'all 0.2s'
            }}>
            <Send size={14} /> {t('authorChat.send')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tool Call Card (streaming) ──

function StreamingToolCard({ segment }) {
  return (
    <div style={{
      padding: '5px 10px',
      borderLeft: '3px solid #00BCD4',
      background: 'var(--bg-elevated)',
      borderRadius: '0 6px 6px 0',
      fontSize: 11,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <Wrench size={10} style={{ color: '#00BCD4', flexShrink: 0 }} />
      <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)' }}>{segment.name}</code>
      {segment.status === 'running'
        ? <Loader size={10} style={{ animation: 'spin 1.5s linear infinite', color: '#00BCD4' }} />
        : <Check size={10} style={{ color: '#4CAF50' }} />
      }
    </div>
  )
}

// ── Options Card (terminal tool: present_options) ──

function OptionsCard({ segment, disabled, onSelect }) {
  return (
    <div style={{
      borderLeft: '3px solid #8b5cf6',
      background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))',
      borderRadius: '0 8px 8px 0',
      padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {segment.description && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
              color: 'var(--text-primary)',
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

// ── Tool Call Card (committed, expandable) ──

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
          expanded ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />
        ) : null}
        <Wrench size={10} style={{ color: '#00BCD4', flexShrink: 0 }} />
        <code style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)' }}>{segment.name}</code>
        {segment.argsPreview && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ({segment.argsPreview})
          </span>
        )}
        <Check size={10} style={{ color: '#4CAF50', marginLeft: 'auto' }} />
      </div>
      {expanded && segment.result && (
        <pre style={{
          margin: '4px 0 0 20px', fontSize: 10, color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 200, overflowY: 'auto',
          padding: '4px 0', borderTop: '1px solid var(--border-subtle)', marginTop: 4
        }}>{segment.result}</pre>
      )}
    </div>
  )
}

// ── Message Bubble Component ──

function MessageBubble({ msg, isExpanded, onToggleThinking, onOptionSelect, optionsDisabled }) {
  const { t } = useI18n()
  const isUser = msg.role === 'user'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
        {isUser ? <><User size={9} /> {t('authorChat.you')}</> : <><PenTool size={9} /> {t('authorChat.author')}</>}
      </div>

      {/* Attachment badges */}
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

      {/* Thinking (collapsible) */}
      {msg.thinking && (
        <div style={{ maxWidth: '85%', marginBottom: 4 }}>
          <button onClick={onToggleThinking} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
            color: 'rgba(139,92,246,0.7)', fontWeight: 600
          }}>
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Brain size={10} />
            {t('authorChat.thinkingProcess')} ({msg.thinking.length} {t('authorChat.chars')})
          </button>
          {isExpanded && (
            <div style={{
              padding: '8px 12px', borderRadius: 10, marginTop: 2,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
              border: '1px solid rgba(139,92,246,0.15)', fontSize: 11, lineHeight: 1.6,
              color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 300, overflowY: 'auto'
            }}>
              {msg.thinking}
            </div>
          )}
        </div>
      )}

      {/* Segment-based rendering for assistant */}
      {!isUser && msg.segments ? (
        <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          {msg.segments.map((seg, i) => (
            seg.type === 'content' ? (
              <div key={i} className="markdown-chat" style={{
                padding: '10px 14px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                borderBottomLeftRadius: 4,
              }}>
                <ReactMarkdown>{seg.text}</ReactMarkdown>
              </div>
            ) : seg.type === 'tool_call' ? (
              <ToolCallCard key={i} segment={seg} />
            ) : seg.type === 'options' ? (
              <OptionsCard key={i} segment={seg} disabled={optionsDisabled} onSelect={onOptionSelect} />
            ) : null
          ))}
        </div>
      ) : (
        /* User messages or legacy assistant messages */
        <div className={isUser ? '' : 'markdown-chat'} style={{
          maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
          fontSize: 13, lineHeight: 1.6,
          whiteSpace: isUser ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
          background: isUser ? 'var(--accent)' : 'var(--bg-elevated)',
          color: isUser ? 'white' : 'var(--text-primary)',
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
