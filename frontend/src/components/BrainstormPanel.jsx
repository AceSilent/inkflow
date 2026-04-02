import { useState, useRef, useEffect } from 'react'
import { Send, Upload, Sparkles, BookOpen, User, Globe, FileText, Check, Settings, MessageSquare, Trash2, RotateCcw, Wrench, ChevronRight, ChevronDown } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'
import { TaskBoardPanel } from './TaskBoardPanel.jsx'
import { AuthorChatPanel } from './AuthorChatPanel.jsx'

// Recursive JSON viewer for lore files
function LoreJsonViewer({ data, depth = 0 }) {
  if (data === null || data === undefined) return null

  // Primitive value
  if (typeof data !== 'object') {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(data)}</span>
  }

  // Array
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--text-muted)' }}>（空）</span>
    // Array of primitives — inline
    if (data.every(v => typeof v !== 'object')) {
      return <span>{data.join('、')}</span>
    }
    return (
      <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
        {data.map((item, i) => (
          <div key={i} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid var(--border-subtle)' }}>
            <LoreJsonViewer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  // Object
  const entries = Object.entries(data)
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)' }}>（空）</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(([key, val]) => {
        const isComplex = val && typeof val === 'object'
        return (
          <LoreEntry key={key} label={key} value={val} isComplex={isComplex} depth={depth} />
        )
      })}
    </div>
  )
}

function LoreEntry({ label, value, isComplex, depth }) {
  const [open, setOpen] = useState(depth < 2)
  const prettyLabel = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  if (!isComplex) {
    return (
      <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--accent)', minWidth: 60, flexShrink: 0 }}>{prettyLabel}:</span>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(value ?? '')}</span>
      </div>
    )
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {prettyLabel}
        {Array.isArray(value) && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>({value.length})</span>}
      </div>
      {open && (
        <div style={{ paddingLeft: 16, marginTop: 4 }}>
          <LoreJsonViewer data={value} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

export function BrainstormPanel({ addToast, onNext, currentBook }) {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)

  // Lore Book State — now includes all lore files
  const [lore, setLore] = useState({
    title: '', genre: '', tone: '',
    protagonist: '', worldSetting: '', synopsis: '',
    targetWords: 500000,
  })
  const [loreFiles, setLoreFiles] = useState({ world_setting: null, characters: null, outline: null })
  const [saving, setSaving] = useState(false)
  const [loreSection, setLoreSection] = useState('meta') // 'meta' | 'world' | 'chars' | 'outline'
  const [leftTab, setLeftTab] = useState('chat') // 'chat' | 'tasks'

  // Load lore from backend (full lore endpoint)
  const fetchLore = () => {
    if (!currentBook?.book_id) return
    fetch(`/api/v1/books/${currentBook.book_id}/lore`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const m = data.meta || {}
        setLore(prev => ({
          ...prev,
          title: m.title || '',
          genre: m.genre || '',
          tone: m.tone || '',
          protagonist: m.protagonist || '',
          worldSetting: m.world_setting || '',
          synopsis: m.synopsis || '',
          targetWords: m.target_words || 500000,
        }))
        setLoreFiles({
          world_setting: data.world_setting || null,
          characters: data.characters || null,
          outline: data.outline || null,
        })
      })
      .catch(() => {})
  }

  // Load chat history + lore from backend on book change
  useEffect(() => {
    if (!currentBook?.book_id) {
      // No book selected — clear all state
      setLore({ title: '', genre: '', tone: '', protagonist: '', worldSetting: '', synopsis: '', targetWords: 500000 })
      setMessages([])
      setHistoryLoaded(false)
      return
    }
    setHistoryLoaded(false)
    
    // Reset state for clean book switch
    setLore({ title: '', genre: '', tone: '', protagonist: '', worldSetting: '', synopsis: '', targetWords: 500000 })
    setMessages([])
    
    // Load book meta
    fetchLore()
    
    // Load chat history
    fetch(`/api/v1/brainstorm/${currentBook.book_id}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.messages && data.messages.length > 0) {
          setMessages(data.messages)
          // Merge persisted lore
          if (data.lore && Object.keys(data.lore).length > 0) {
            setLore(prev => ({ ...prev, ...data.lore }))
          }
        } else {
          // Show welcome message for new sessions
          setMessages([{ id: 'welcome', role: 'assistant', content: t('brainstorm.welcomeMsg') }])
        }
        setHistoryLoaded(true)
      })
      .catch(() => {
        setMessages([{ id: 'welcome', role: 'assistant', content: t('brainstorm.welcomeMsg') }])
        setHistoryLoaded(true)
      })
  }, [currentBook])

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const setLoreField = (key, val) => setLore(prev => ({ ...prev, [key]: val }))

  // ── Send message ──
  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input
    setInput('')
    
    // Optimistic UI update
    const tempUserId = `tmp_${Date.now()}`
    setMessages(prev => [...prev, { id: tempUserId, role: 'user', content: userMsg }])
    
    setLoading(true)
    try {
      const res = await fetch('/api/v1/brainstorm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: currentBook?.book_id || 'default',
          message: userMsg,
          current_lore: lore
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        // Replace temp message with server-persisted version and add AI reply
        // Reload full history to get server-assigned IDs
        const histRes = await fetch(`/api/v1/brainstorm/${currentBook.book_id}/history`)
        if (histRes.ok) {
          const hist = await histRes.json()
          setMessages(hist.messages)
        } else {
          // Fallback: just append the reply
          setMessages(prev => [...prev, { id: `ai_${Date.now()}`, role: 'assistant', content: data.reply }])
        }
        
        if (data.extracted_lore) {
          setLore(prev => ({ ...prev, ...data.extracted_lore }))
          addToast(t('brainstorm.loreExtracted'), 'info')
        }
      } else {
        throw new Error('Chat failed')
      }
    } catch (e) {
      console.error(e)
      setMessages(prev => [...prev, { id: `err_${Date.now()}`, role: 'assistant', content: "抱歉，出错了，请检查网络和 API 配置。" }])
    }
    setLoading(false)
  }

  // ── File upload ──
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''
    
    const fileNames = files.map(f => f.name).join('、')
    const uploadMsg = `[已上传 ${files.length} 份文件：${fileNames}] 请参考这些资料，分析其中的设定和剧情要素。`
    setMessages(prev => [...prev, { id: `tmp_${Date.now()}`, role: 'user', content: uploadMsg }])
    setLoading(true)
    
    try {
      if (currentBook?.book_id) {
        const formData = new FormData()
        files.forEach(file => formData.append('files', file))
        await fetch(`/api/v1/books/${currentBook.book_id}/materials`, {
          method: 'POST', body: formData,
        })
      }
      
      const fileContents = await Promise.all(
        files.map(file => file.text().catch(() => `[无法读取: ${file.name}]`))
      )
      const contextMsg = files.map((f, i) => `--- ${f.name} ---\n${fileContents[i].slice(0, 3000)}`).join('\n\n')
      
      const res = await fetch('/api/v1/brainstorm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: currentBook?.book_id || 'default',
          message: `用户上传了以下文件，请仔细阅读并提取关键设定信息：\n\n${contextMsg}`,
          current_lore: lore
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        // Reload history
        const histRes = await fetch(`/api/v1/brainstorm/${currentBook.book_id}/history`)
        if (histRes.ok) {
          const hist = await histRes.json()
          setMessages(hist.messages)
        }
        if (data.extracted_lore) {
          setLore(prev => ({ ...prev, ...data.extracted_lore }))
          addToast(t('brainstorm.loreExtracted'), 'info')
        }
      } else {
        throw new Error('AI analysis failed')
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { id: `err_${Date.now()}`, role: 'assistant', content: "抱歉，文件分析失败。请检查 API 配置后重试。" }])
    }
    setLoading(false)
  }

  // ── Delete message (pair-delete: user + following assistant) ──
  const handleDeleteMessage = async (msg, idx) => {
    const idsToDelete = [msg.id]
    
    // If it's a user message, also delete the next assistant reply
    if (msg.role === 'user' && idx + 1 < messages.length && messages[idx + 1].role === 'assistant') {
      idsToDelete.push(messages[idx + 1].id)
    }
    // If it's an assistant message, also delete the preceding user message
    if (msg.role === 'assistant' && idx - 1 >= 0 && messages[idx - 1].role === 'user') {
      idsToDelete.push(messages[idx - 1].id)
    }
    
    // Optimistic removal
    const idSet = new Set(idsToDelete)
    setMessages(prev => prev.filter(m => !idSet.has(m.id)))
    
    // Sync to backend
    try {
      await fetch(`/api/v1/brainstorm/${currentBook.book_id}/history/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      })
    } catch (e) {
      console.warn('Failed to delete on server:', e)
    }
  }

  // ── Rollback to message ──
  const handleRollback = async (msg) => {
    if (!currentBook?.book_id) return
    try {
      const res = await fetch(`/api/v1/brainstorm/${currentBook.book_id}/history/truncate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id })
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        if (data.truncated_content) {
          setInput(data.truncated_content)
        }
        addToast?.('已回退到此消息', 'info')
      }
    } catch (e) {
      console.warn('Rollback failed:', e)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 400px', gap: 24, height: '100%', flex: 1, minHeight: 0 }}>
      
      {/* LEFT PANE: Chat + Task Board (Tab Switch) */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <button
            onClick={() => setLeftTab('chat')}
            style={{
              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: leftTab === 'chat' ? 'var(--bg-surface)' : 'transparent',
              color: leftTab === 'chat' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: leftTab === 'chat' ? '2px solid var(--accent)' : '2px solid transparent',
              border: 'none', borderRadius: 0, transition: 'all 0.2s'
            }}
          ><MessageSquare size={13} style={{ display: 'inline', verticalAlign: -2 }} /> 对话</button>
          <button
            onClick={() => setLeftTab('tasks')}
            style={{
              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: leftTab === 'tasks' ? 'var(--bg-surface)' : 'transparent',
              color: leftTab === 'tasks' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: leftTab === 'tasks' ? '2px solid var(--accent)' : '2px solid transparent',
              border: 'none', borderRadius: 0, transition: 'all 0.2s'
            }}
          ><FileText size={13} style={{ display: 'inline', verticalAlign: -2 }} /> 任务看板</button>
        </div>
        {/* Tab Content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {leftTab === 'chat'
            ? <AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={fetchLore} />
            : <TaskBoardPanel bookId={currentBook?.book_id} />
          }
        </div>
      </div>



      {/* RIGHT PANE: Lore Book */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} style={{ color: 'var(--warning)' }}/>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('brainstorm.loreTitle')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{t('brainstorm.loreAutoUpdate')}</span>
          </div>
          
          <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['meta','基础'],['world','世界观'],['chars','角色'],['outline','大纲']].map(([key, label]) => (
                <button key={key} onClick={() => setLoreSection(key)} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
                  background: loreSection === key ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: loreSection === key ? '#fff' : 'var(--text-secondary)',
                  fontWeight: loreSection === key ? 600 : 400,
                }}>{label}</button>
              ))}
            </div>

            {/* Meta Section */}
            {loreSection === 'meta' && (
              <>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Settings size={12}/> 书名</label>
                  <input className="input" value={lore.title} onChange={e => setLoreField('title', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={12}/> 主角设定</label>
                  <textarea className="textarea" rows={3} value={lore.protagonist} onChange={e => setLoreField('protagonist', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={12}/> 世界观</label>
                  <textarea className="textarea" rows={3} value={lore.worldSetting} onChange={e => setLoreField('worldSetting', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12}/> 核心梗概</label>
                  <textarea className="textarea" rows={3} value={lore.synopsis} onChange={e => setLoreField('synopsis', e.target.value)} />
                </div>
              </>
            )}

            {/* World Setting Section */}
            {loreSection === 'world' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.world_setting ? (
                  <LoreJsonViewer data={loreFiles.world_setting} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无世界观设定数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}

            {/* Characters Section */}
            {loreSection === 'chars' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.characters ? (
                  <LoreJsonViewer data={loreFiles.characters} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无角色设定数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}

            {/* Outline Section */}
            {loreSection === 'outline' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.outline ? (
                  <LoreJsonViewer data={loreFiles.outline} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无大纲数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
