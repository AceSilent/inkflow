import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Wrench, Paperclip, X, FileText } from 'lucide-react'

export function AuthorChatPanel({ currentBook, addToast }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState([]) // [{name, content, size}]
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const bookId = currentBook?.book_id

  // Load history
  useEffect(() => {
    if (!bookId) return
    fetch(`/api/v1/author-chat/${bookId}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.messages) setMessages(data.messages) })
      .catch(() => {})
  }, [bookId])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        setAttachments(prev => [...prev, {
          name: file.name,
          content: ev.target.result,
          size: file.size
        }])
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

    // Build message with attachments
    let userMsg = input.trim()
    if (attachments.length > 0) {
      const fileParts = attachments.map(a =>
        `\n\n--- 附件: ${a.name} (${(a.size / 1024).toFixed(1)}KB) ---\n${a.content}`
      ).join('')
      userMsg = userMsg + fileParts
    }

    setInput('')
    setAttachments([])
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMsg,
      hasAttachments: attachments.length > 0,
      attachmentNames: attachments.map(a => a.name)
    }])
    setLoading(true)

    try {
      const resp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      })
      const data = await resp.json()
      if (data?.reply) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          tool_calls: data.tool_calls || []
        }])
      }
    } catch (e) {
      addToast?.('发送失败: ' + e.message, 'error')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleClear = async () => {
    if (!bookId) return
    await fetch(`/api/v1/author-chat/${bookId}/history`, { method: 'DELETE' })
    setMessages([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
          <span style={{ fontSize: 18 }}>✍️</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>作者 Agent</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>
            8 tools
          </span>
        </div>
        <button
          onClick={handleClear}
          title="清空对话"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4, borderRadius: 4
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13, lineHeight: 2 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✍️</div>
            <div>直接和作者 Agent 对话</div>
            <div style={{ fontSize: 11 }}>他能查设定、写大纲、写正文、提交审核</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>📎 支持发送文件作为参考资料</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
              {msg.role === 'user' ? '👤 你' : '✍️ 作者'}
            </div>
            {/* Attachment badges for user messages */}
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
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
              borderBottomLeftRadius: msg.role === 'user' ? 12 : 4,
            }}>
              {/* For user messages with attachments, only show the text part */}
              {msg.role === 'user' && msg.hasAttachments
                ? msg.content.split('\n\n--- 附件:')[0] || '(已发送附件)'
                : msg.content
              }
            </div>
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
        ))}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>✍️ 作者</div>
            <div style={{
              padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
              fontSize: 13, color: 'var(--text-muted)', maxWidth: '85%',
              borderBottomLeftRadius: 4, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span>思考中</span>
              <span style={{ animation: 'pulse 1.5s infinite' }}>...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Attachment Preview Bar */}
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
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                {(a.size / 1024).toFixed(1)}KB
              </span>
              <button
                onClick={() => removeAttachment(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex' }}
              >
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.json,.csv,.py,.js,.jsx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="附加文件 (txt/md/json/csv/py/js)"
          style={{
            background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8,
            display: 'flex', alignItems: 'center', transition: 'all 0.2s'
          }}
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给作者下指令... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          style={{
            flex: 1, resize: 'none', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={(!input.trim() && attachments.length === 0) || loading}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: (input.trim() || attachments.length > 0) && !loading ? 'var(--accent)' : 'var(--bg-elevated)',
            color: (input.trim() || attachments.length > 0) && !loading ? 'white' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600,
            transition: 'all 0.2s'
          }}
        >
          <Send size={14} /> 发送
        </button>
      </div>
    </div>
  )
}
