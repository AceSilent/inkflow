import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Wrench, Paperclip, X, FileText, ChevronDown, ChevronRight, Brain, PenTool, User, Loader, Check } from 'lucide-react'
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
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const bookId = currentBook?.book_id

  // Load history
  useEffect(() => {
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

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMsg])

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

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading || !bookId) return

    let userMsg = input.trim()
    if (attachments.length > 0) {
      const fileParts = attachments.map(a =>
        `\n\n--- ${t('authorChat.attachment')}: ${a.name} (${(a.size / 1024).toFixed(1)}KB) ---\n${a.content}`
      ).join('')
      userMsg = userMsg + fileParts
    }

    const attachmentNames = attachments.map(a => a.name)
    setInput('')
    setAttachments([])
    setMessages(prev => [...prev, {
      role: 'user', content: userMsg,
      hasAttachments: attachmentNames.length > 0, attachmentNames
    }])
    setLoading(true)
    setStreamingMsg({ thinking: '', segments: [], thinkingDone: false, phase: 'init', retry: null })

    try {
      const resp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
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
              setStreamingMsg(prev => ({
                ...prev,
                retry: { attempt: evt.attempt, delayMs: evt.delay_ms, status: evt.status, reason: evt.reason },
              }))
            } else if (evt.type === 'thinking') {
              finalThinking += evt.token
              // First successful chunk after a retry — clear the retry banner.
              setStreamingMsg(prev => ({ ...prev, thinking: prev.thinking + evt.token, thinkingDone: false, retry: null }))
            } else if (evt.type === 'content') {
              currentContentBuf += evt.token
              // Update segments for live display
              const liveSegments = [...segments, { type: 'content', text: currentContentBuf, streaming: true }]
              setStreamingMsg(prev => ({
                ...prev, segments: liveSegments, retry: null
              }))
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
      addToast?.(t('authorChat.sendFailed') + ': ' + e.message, 'error')
    } finally {
      setLoading(false)
      setStreamingMsg(null)
      inputRef.current?.focus()
    }
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
        <button onClick={handleClear} title="清空对话"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}>
          <Trash2 size={14} />
        </button>
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
          />
        ))}

        {/* Live streaming message */}
        {streamingMsg && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><PenTool size={9} /> {t('authorChat.author')}</div>

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
                  {Math.round(streamingMsg.retry.delayMs / 1000)}s 后再试
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
        <button onClick={handleSend}
          disabled={(!input.trim() && attachments.length === 0) || loading}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: (input.trim() || attachments.length > 0) && !loading ? 'var(--accent)' : 'var(--bg-elevated)',
            color: (input.trim() || attachments.length > 0) && !loading ? 'white' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, transition: 'all 0.2s'
          }}>
          <Send size={14} /> {t('authorChat.send')}
        </button>
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

function MessageBubble({ msg, isExpanded, onToggleThinking }) {
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
