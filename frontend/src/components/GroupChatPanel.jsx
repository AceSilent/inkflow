import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, ChevronDown, ChevronRight, MessageSquare, Hash, Lock, Upload, FileText, X, Paperclip, Crown, Lightbulb, Skull, PenTool, User, Brain } from 'lucide-react'

// Agent icon components (lucide-react)
const AGENT_ICON_MAP = {
  editor: Crown, proposer: Lightbulb, devil: Skull, author: PenTool, human: User,
}

const AGENT_LABELS = {
  editor: '总编辑', proposer: '提案策划', devil: '魔鬼代言人', author: '作者', human: '人类',
}

export function GroupChatPanel({ currentBook, addToast, onFileEdits, forceChannel }) {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(forceChannel || 'group')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedThinking, setExpandedThinking] = useState({})
  const chatEndRef = useRef(null)
  const eventSourceRef = useRef(null)
  const fileInputRef = useRef(null)
  const [attachments, setAttachments] = useState([]) // [{name, content, size}]

  const bookId = currentBook?.book_id

  // Load channels
  useEffect(() => {
    if (!bookId) return
    fetch(`/api/v1/channels/${bookId}/list`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.channels) { console.log('Channels loaded:', data.channels.length, data.channels.map(c => c.display_name)); setChannels(data.channels) } })
      .catch(() => {})
  }, [bookId])

  // Load history when channel changes
  useEffect(() => {
    if (!bookId) return
    fetch(`/api/v1/channels/${bookId}/${activeChannel}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.messages) setMessages(data.messages) })
      .catch(() => {})
  }, [bookId, activeChannel])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || loading || !bookId) return
    const text = input.trim()
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    setLoading(true)

    // Build display content (text + file icons)
    const displayContent = text + (currentAttachments.length > 0
      ? `\n[附件: ${currentAttachments.map(f => f.name).join(', ')}]`
      : '')

    // Optimistically add human message
    const humanMsg = {
      id: `tmp_${Date.now()}`,
      role: 'human',
      display_name: '人类',
      avatar_color: '#9E9E9E',
      content: displayContent,
      is_pass: false,
      attachments: currentAttachments.map(f => ({ name: f.name, size: f.size })),
      ts: Date.now() / 1000,
    }
    setMessages(prev => [...prev, humanMsg])

    // Cancel any existing SSE
    if (eventSourceRef.current) {
      eventSourceRef.current.abort()
    }

    try {
      const controller = new AbortController()
      eventSourceRef.current = controller

      const response = await fetch(`/api/v1/channels/${bookId}/${activeChannel}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || '请分析以下文件',
          sender: 'human',
          attachments: currentAttachments.map(f => ({ name: f.name, content: f.content })),
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error('Send failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              handleSSEEvent(eventType, data)
            } catch (e) {
              console.warn('SSE parse error:', e)
            }
            eventType = ''
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('GroupChat error:', err)
        addToast?.('群聊发送失败', 'error')
      }
    }

    setLoading(false)

    // Reload history to get canonical state
    try {
      const res = await fetch(`/api/v1/channels/${bookId}/${activeChannel}/history`)
      if (res.ok) {
        const data = await res.json()
        if (data?.messages) setMessages(data.messages)
      }
    } catch (e) {}

    // Refresh channel list (message counts)
    try {
      const res = await fetch(`/api/v1/channels/${bookId}/list`)
      if (res.ok) {
        const data = await res.json()
        if (data?.channels) setChannels(data.channels)
      }
    } catch (e) {}
  }, [input, loading, bookId, activeChannel, addToast, attachments])

  const handleSSEEvent = useCallback((eventType, data) => {
    if (eventType === 'agent_thinking') {
      // Add a streaming placeholder for this agent
      setMessages(prev => [...prev, {
        id: `stream_${data.agent}_${Date.now()}`,
        role: data.agent,
        display_name: data.display_name,
        avatar_color: data.avatar_color,
        content: '',
        thinking: '',
        is_pass: false,
        _isStreaming: true,
        _streamPhase: 'thinking', // 'thinking' or 'content'
        ts: Date.now() / 1000,
      }])
    } else if (eventType === 'thinking_token') {
      // Append thinking token to the streaming message
      setMessages(prev => {
        const updated = [...prev]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === data.agent && updated[i]._isStreaming) {
            updated[i] = {
              ...updated[i],
              thinking: (updated[i].thinking || '') + data.token,
              _streamPhase: 'thinking',
            }
            break
          }
        }
        return updated
      })
    } else if (eventType === 'content_token') {
      // Append content token to the streaming message
      setMessages(prev => {
        const updated = [...prev]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === data.agent && updated[i]._isStreaming) {
            updated[i] = {
              ...updated[i],
              content: (updated[i].content || '') + data.token,
              _streamPhase: 'content',
            }
            break
          }
        }
        return updated
      })
    } else if (eventType === 'agent_reply') {
      // Replace streaming placeholder with final canonical message
      setMessages(prev => {
        const filtered = prev.filter(m =>
          !(m.role === data.agent && m._isStreaming)
        )
        return [...filtered, {
          id: data.id || `msg_${Date.now()}`,
          role: data.agent,
          display_name: data.display_name,
          avatar_color: data.avatar_color,
          content: data.content,
          thinking: data.thinking,
          is_pass: data.is_pass,
          file_edits: data.file_edits || [],
          round_number: data.round_number,
          ts: data.ts || Date.now() / 1000,
        }]
      })
      // If file_edits present, notify parent to refresh lore
      if (data.file_edits && data.file_edits.length > 0) {
        onFileEdits?.()
      }
    } else if (eventType === 'round_complete') {
      if (data.reason === 'all_passed') {
        addToast?.('讨论已收敛，所有Agent无补充', 'info')
      } else if (data.reason === 'editor_finalized') {
        addToast?.('总编辑已拍板定案', 'success')
      }
    }
  }, [addToast])

  const toggleThinking = (msgId) => {
    setExpandedThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  // File upload — stores as attachments, not into input text
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const newAttachments = await Promise.all(
      files.map(async (f) => {
        const content = await f.text().catch(() => `[无法读取: ${f.name}]`)
        return { name: f.name, content, size: f.size }
      })
    )
    setAttachments(prev => [...prev, ...newAttachments])
    e.target.value = ''
  }

  // Key handler
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1a1a2e' }}>
      {/* Channel Sidebar — hidden when forceChannel is set */}
      {!forceChannel && <div style={{
        width: 180, borderRight: '1px solid #2a2a4a', padding: '8px 0',
        display: 'flex', flexDirection: 'column', gap: 2,
        background: '#16162b',
      }}>
        <div style={{
          padding: '8px 12px', fontSize: 11, color: '#888',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          频道
        </div>
        {channels.map(ch => (
          <button
            key={ch.channel_id}
            onClick={() => setActiveChannel(ch.channel_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', border: 'none', cursor: 'pointer',
              background: activeChannel === ch.channel_id ? '#2a2a5a' : 'transparent',
              color: activeChannel === ch.channel_id ? '#fff' : '#aaa',
              fontSize: 13, textAlign: 'left', borderRadius: 4,
              margin: '0 4px',
              transition: 'background 0.15s',
            }}
          >
            {ch.channel_type === 'group'
              ? <Hash size={14} style={{ opacity: 0.6 }} />
              : <Lock size={14} style={{ opacity: 0.4 }} />
            }
            <span>{ch.display_name}</span>
            {ch.message_count > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 10, background: '#3a3a6a',
                borderRadius: 8, padding: '1px 5px', color: '#ccc',
              }}>
                {ch.message_count}
              </span>
            )}
          </button>
        ))}
      </div>}

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #2a2a4a',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {/* Mode toggle when forceChannel is set */}
          {forceChannel && (
            <div style={{ display: 'flex', gap: 2, background: '#16162b', borderRadius: 6, padding: 2 }}>
              <button onClick={() => setActiveChannel(forceChannel)} style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
                background: activeChannel === forceChannel ? '#4FC3F7' : 'transparent',
                color: activeChannel === forceChannel ? '#000' : '#888',
                fontWeight: activeChannel === forceChannel ? 600 : 400,
              }}><Crown size={12} style={{ display: 'inline', verticalAlign: -2 }} /> 1:1 编辑</button>
              <button onClick={() => setActiveChannel('group')} style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
                background: activeChannel === 'group' ? '#4FC3F7' : 'transparent',
                color: activeChannel === 'group' ? '#000' : '#888',
                fontWeight: activeChannel === 'group' ? 600 : 400,
              }}><Hash size={12} style={{ display: 'inline', verticalAlign: -2 }} /> 群聊</button>
            </div>
          )}
          {!forceChannel && (
            <>
              {channels.find(c => c.channel_id === activeChannel)?.channel_type === 'group'
                ? <Hash size={16} style={{ color: '#888' }} />
                : <Lock size={16} style={{ color: '#888' }} />
              }
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
                {channels.find(c => c.channel_id === activeChannel)?.display_name || activeChannel}
              </span>
            </>
          )}
          {loading && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4FC3F7' }}>
              ⟳ Agent思考中...
            </span>
          )}
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {messages.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
              <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>发条消息开始群聊讨论</div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id || idx}
              msg={msg}
              expanded={expandedThinking[msg.id]}
              onToggleThinking={() => toggleThinking(msg.id)}
            />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Attachment pills */}
        {attachments.length > 0 && (
          <div style={{
            padding: '6px 12px', borderTop: '1px solid #2a2a4a',
            display: 'flex', gap: 6, flexWrap: 'wrap',
          }}>
            {attachments.map((att, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', background: '#2a2a5a', borderRadius: 6,
                border: '1px solid #3a3a6a', fontSize: 12, color: '#aaa',
              }}>
                <FileText size={12} style={{ color: '#4FC3F7' }} />
                <span>{att.name}</span>
                <span style={{ color: '#666', fontSize: 10 }}>({(att.size / 1024).toFixed(1)}KB)</span>
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#666', padding: 0, display: 'flex',
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '8px 12px', borderTop: attachments.length > 0 ? 'none' : '1px solid #2a2a4a',
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'none', border: '1px solid #444', borderRadius: 6,
              padding: '6px 8px', cursor: 'pointer', color: '#888',
            }}
            title="上传文件"
          >
            <Upload size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file" multiple accept=".md,.txt,.json,.csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter发送, Shift+Enter换行)"
            style={{
              flex: 1, resize: 'none', border: '1px solid #444',
              borderRadius: 8, padding: '8px 12px', background: '#222244',
              color: '#eee', fontSize: 13, minHeight: 36, maxHeight: 120,
              outline: 'none', fontFamily: 'inherit',
            }}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            style={{
              background: loading ? '#333' : '#4FC3F7',
              border: 'none', borderRadius: 8, padding: '8px 12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#fff', display: 'flex', alignItems: 'center',
              gap: 4, fontSize: 13, fontWeight: 600,
              opacity: loading || !input.trim() ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            <Send size={14} /> 发送
          </button>
        </div>
      </div>
    </div>
  )
}


function MessageBubble({ msg, expanded, onToggleThinking }) {
  if (msg._isStreaming) {
    // Live streaming state — show thinking and content as they arrive
    return (
      <div style={{
        display: 'flex', gap: 8, padding: '6px 0',
      }}>
        <AgentAvatar role={msg.role} color={msg.avatar_color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: msg.avatar_color || '#aaa' }}>
              {msg.display_name}
            </span>
            <span style={{ fontSize: 10, color: '#4FC3F7', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Brain size={10} /> {msg._streamPhase === 'thinking' ? '思考中...' : '回复中...'}
            </span>
          </div>

          {/* Live thinking content */}
          {msg.thinking && (
            <div style={{
              padding: '6px 10px', background: '#1a1a30',
              borderRadius: 6, borderLeft: '2px solid #4FC3F7',
              fontSize: 12, color: '#888', whiteSpace: 'pre-wrap',
              maxHeight: 200, overflowY: 'auto', marginBottom: 4,
            }}>
              {msg.thinking}
              {msg._streamPhase === 'thinking' && (
                <span style={{ animation: 'pulse 1s infinite', color: '#4FC3F7' }}>▌</span>
              )}
            </div>
          )}

          {/* Live content */}
          {msg.content && (
            <div style={{
              color: '#ddd', fontSize: 13, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
              {msg._streamPhase === 'content' && (
                <span style={{ animation: 'pulse 1s infinite', color: '#4FC3F7' }}>▌</span>
              )}
            </div>
          )}

          {/* Show cursor when nothing yet */}
          {!msg.thinking && !msg.content && (
            <div style={{ color: '#666', fontSize: 13, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Brain size={13} style={{ animation: 'pulse 1s infinite' }} /> 思考中...
            </div>
          )}
        </div>
      </div>
    )
  }

  const isPass = msg.is_pass
  const isHuman = msg.role === 'human'

  return (
    <div style={{
      display: 'flex', gap: 8, padding: '6px 0',
      opacity: isPass ? 0.4 : 1,
    }}>
      <AgentAvatar role={msg.role} color={msg.avatar_color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 2,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: msg.avatar_color || '#aaa',
          }}>
            {msg.display_name || AGENT_LABELS[msg.role] || msg.role}
          </span>
          {msg.round_number > 0 && (
            <span style={{ fontSize: 10, color: '#555' }}>
              R{msg.round_number}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#444' }}>
            {msg.ts ? new Date(msg.ts * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>

        {/* Thinking (collapsible) */}
        {msg.thinking && !isHuman && (
          <div style={{ marginBottom: 4 }}>
            <button
              onClick={onToggleThinking}
              style={{
                background: 'none', border: '1px solid #333', borderRadius: 4,
                color: '#666', cursor: 'pointer', fontSize: 11,
                padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Brain size={11} style={{ marginRight: 2 }} /> 思考过程
            </button>
            {expanded && (
              <div style={{
                marginTop: 4, padding: '6px 10px', background: '#1a1a30',
                borderRadius: 6, borderLeft: '2px solid #444',
                fontSize: 12, color: '#888', whiteSpace: 'pre-wrap',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {msg.thinking}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {isPass ? (
          <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>
            [无补充]
          </div>
        ) : (
          <div style={{
            color: '#ddd', fontSize: 13, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {msg.content}
          </div>
        )}

        {/* File Edits */}
        {msg.file_edits && msg.file_edits.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {msg.file_edits.map((edit, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', background: '#1a3a1a', borderRadius: 4,
                border: '1px solid #2a5a2a', fontSize: 12,
              }}>
                <FileText size={12} style={{ color: '#66BB6A' }} />
                <span style={{ color: '#66BB6A' }}>
                  {edit.summary || `已修改: ${edit.file_path}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


function AgentAvatar({ role, color }) {
  const IconComp = AGENT_ICON_MAP[role] || User
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: `${color || '#444'}22`,
      border: `2px solid ${color || '#444'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 2,
    }}>
      <IconComp size={16} style={{ color: color || '#888' }} />
    </div>
  )
}

export default GroupChatPanel
