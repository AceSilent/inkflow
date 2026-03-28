import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Wrench, Paperclip, X, FileText, ChevronDown, ChevronRight, Brain, PenTool, User, Loader } from 'lucide-react'

export function AuthorChatPanel({ currentBook, addToast }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [streamingMsg, setStreamingMsg] = useState(null) // {thinking, content, tools, thinkingDone}
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
        // Restore attachment + thinking metadata
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
          // Restore thinking from backend
          if (m.thinking) {
            thinkingState[id] = false  // collapsed by default
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
        addToast?.(`文件 ${file.name} 超过 512KB 限制`, 'error')
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
        `\n\n--- 附件: ${a.name} (${(a.size / 1024).toFixed(1)}KB) ---\n${a.content}`
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
    setStreamingMsg({ thinking: '', content: '', tools: [], thinkingDone: false })

    try {
      const resp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let finalContent = ''
      let finalThinking = ''
      let finalTools = []

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

            if (evt.type === 'thinking') {
              finalThinking += evt.token
              setStreamingMsg(prev => ({ ...prev, thinking: prev.thinking + evt.token }))
            } else if (evt.type === 'content') {
              finalContent += evt.token
              setStreamingMsg(prev => ({
                ...prev, content: prev.content + evt.token, thinkingDone: true
              }))
            } else if (evt.type === 'tool_start') {
              finalTools.push(evt.name)
              setStreamingMsg(prev => ({
                ...prev, tools: [...prev.tools, { name: evt.name, status: 'running' }]
              }))
            } else if (evt.type === 'tool_done') {
              setStreamingMsg(prev => ({
                ...prev,
                tools: prev.tools.map(t =>
                  t.name === evt.name && t.status === 'running'
                    ? { ...t, status: 'done', preview: evt.result_preview }
                    : t
                )
              }))
            } else if (evt.type === 'error') {
              finalContent = `错误: ${evt.message}`
              setStreamingMsg(prev => ({ ...prev, content: finalContent }))
            } else if (evt.type === 'done') {
              // Stream complete
            }
          } catch {}
        }
      }

      // Commit the final message
      const msgId = Date.now()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalContent || '(无回复)',
        thinking: finalThinking,
        tool_calls: finalTools,
        id: msgId
      }])
      if (finalThinking) {
        setExpandedThinking(prev => ({ ...prev, [msgId]: false }))
      }

    } catch (e) {
      addToast?.('发送失败: ' + e.message, 'error')
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
        请先选择或创建一本书
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
            8 tools · streaming
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
            <div>直接和作者 Agent 对话</div>
            <div style={{ fontSize: 11 }}>他能查设定、写大纲、写正文、提交审核</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>支持发送文件 · 支持查看思考过程</div>
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><PenTool size={9} /> 作者</div>

            {/* Tool calls in progress */}
            {streamingMsg.tools.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                {streamingMsg.tools.map((t, j) => (
                  <div key={j} style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: 4,
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <Wrench size={10} />
                    <span>{t.name}</span>
                    {t.status === 'running'
                      ? <Loader size={10} style={{ animation: 'spin 1.5s linear infinite', marginLeft: 4 }} />
                      : <span style={{ color: 'var(--success)', marginLeft: 4 }}>done</span>
                    }
                  </div>
                ))}
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
                  <Brain size={10} /> 思考中...
                </div>
                {streamingMsg.thinking}
              </div>
            )}

            {/* Content */}
            {streamingMsg.content ? (
              <div style={{
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                borderBottomLeftRadius: 4,
              }}>
                {streamingMsg.content}
                <span style={{ animation: 'pulse 1s infinite' }}>▍</span>
              </div>
            ) : !streamingMsg.thinking && streamingMsg.tools.length === 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
                fontSize: 13, color: 'var(--text-muted)', borderBottomLeftRadius: 4
              }}>
                思考中<span style={{ animation: 'pulse 1.5s infinite' }}>...</span>
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
        <button onClick={() => fileInputRef.current?.click()} title="附加文件"
          style={{
            background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center'
          }}>
          <Paperclip size={16} />
        </button>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="给作者下指令... (Enter 发送, Shift+Enter 换行)" rows={1}
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
          <Send size={14} /> 发送
        </button>
      </div>
    </div>
  )
}

// ── Message Bubble Component ──

function MessageBubble({ msg, isExpanded, onToggleThinking }) {
  const isUser = msg.role === 'user'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
        {isUser ? <><User size={9} /> 你</> : <><PenTool size={9} /> 作者</>}
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
            思考过程 ({msg.thinking.length} 字)
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

      {/* Content bubble */}
      <div style={{
        maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
        fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: isUser ? 'var(--accent)' : 'var(--bg-elevated)',
        color: isUser ? 'white' : 'var(--text-primary)',
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
      }}>
        {isUser && msg.hasAttachments
          ? msg.content.split('\n\n--- 附件:')[0] || '(已发送附件)'
          : msg.content
        }
      </div>

      {/* Tool call badges */}
      {msg.tool_calls?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {msg.tool_calls.map((tool, j) => (
            <span key={j} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: 'var(--bg-elevated)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 3
            }}>
              <Wrench size={9} /> {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
