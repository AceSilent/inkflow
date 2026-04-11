/**
 * Feishu command parser and handlers.
 * Commands start with '/' — everything else is free text → Agent chat.
 */
import fs from 'fs'
import path from 'path'
import { type CommandContext, type CommandResult } from './types.js'
import { setSession, getSession } from './session.js'
import {
  buildHelpCard, buildBookListCard, buildBookInfoCard,
  buildOutlineCard, buildLoreCard, buildChapterListCard, buildReviewCard, buildTextCard,
} from './card-builder.js'

// ── Book data helpers (reuse existing data layer) ──

function booksDir(dataDir: string): string {
  return path.resolve(dataDir)
}

function listBooksMeta(dataDir: string): { book_id: string; title: string; genre?: string; tone?: string; target_words?: number }[] {
  const dir = booksDir(dataDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(name => {
      const metaPath = path.join(dir, name, '00_Config', 'book_meta.json')
      return fs.existsSync(metaPath)
    })
    .map(name => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, name, '00_Config', 'book_meta.json'), 'utf-8'))
        return { book_id: name, ...meta }
      } catch {
        return null
      }
    })
    .filter(Boolean) as any[]
}

function getBookMeta(dataDir: string, bookId: string) {
  const p = path.join(booksDir(dataDir), bookId, '00_Config', 'book_meta.json')
  if (!fs.existsSync(p)) return null
  try {
    return { book_id: bookId, ...JSON.parse(fs.readFileSync(p, 'utf-8')) }
  } catch {
    return null
  }
}

function readOutline(dataDir: string, bookId: string) {
  const p = path.join(booksDir(dataDir), bookId, '02_Outlines', 'outline.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function readLore(dataDir: string, bookId: string) {
  const dir = path.join(booksDir(dataDir), bookId, '01_Global_Settings')
  const result: Record<string, any> = {}
  const files = [
    { key: 'meta', path: path.join('..', '00_Config', 'book_meta.json') },
    { key: 'world_setting', path: 'world_lore.json' },
    { key: 'characters', path: 'characters.json' },
  ]
  for (const f of files) {
    const fp = f.key === 'meta' ? path.resolve(dir, f.path) : path.join(dir, f.path)
    if (fs.existsSync(fp)) {
      try { result[f.key] = JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { /* skip */ }
    }
  }
  return result
}

function listChapters(dataDir: string, bookId: string) {
  const outline = readOutline(dataDir, bookId)
  if (!outline) return []
  const chapters: { id: string; label: string; status?: string }[] = []
  function walk(node: any) {
    if (node.type === 'chapter') {
      chapters.push({ id: node.id, label: node.label, status: node.status })
    }
    if (node.children) node.children.forEach(walk)
  }
  walk(outline)
  return chapters
}

function readReview(dataDir: string, bookId: string, chapterId: string) {
  const p = path.join(booksDir(dataDir), bookId, '04_Drafts', `review_${chapterId}.json`)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function createBook(dataDir: string, title: string, genre?: string, tone?: string): { book_id: string; title: string } | null {
  const rawId = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').slice(0, 30)
  const suffix = Math.random().toString(36).slice(2, 10)
  const bookId = `${rawId}_${suffix}`
  const bookDir = path.join(booksDir(dataDir), bookId)

  try {
    fs.mkdirSync(path.join(bookDir, '00_Config'), { recursive: true })
    fs.mkdirSync(path.join(bookDir, '01_Global_Settings'), { recursive: true })
    fs.mkdirSync(path.join(bookDir, '02_Outlines'), { recursive: true })
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })

    const meta = { title, genre: genre || '', tone: tone || '', target_words: 100000, created_at: new Date().toISOString() }
    fs.writeFileSync(path.join(bookDir, '00_Config', 'book_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

    return { book_id: bookId, title }
  } catch (e: any) {
    console.error('[feishu] createBook failed:', e.message)
    return null
  }
}

// ── Command parsing ──

export function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: '' }
  }
  return {
    command: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim(),
  }
}

// ── Command handlers ──

export async function handleCommand(
  command: string,
  args: string,
  ctx: CommandContext,
): Promise<CommandResult> {
  switch (command) {
    case 'help':
    case '帮助':
      return { type: 'card', cardJson: buildHelpCard() }

    case 'list':
    case '列表':
    case '书籍': {
      const books = listBooksMeta(ctx.dataDir)
      return { type: 'card', cardJson: buildBookListCard(books) }
    }

    case 'create':
    case '创建': {
      const parts = args.split(/\s+/)
      const title = parts[0]
      if (!title) return { type: 'text', content: '用法: /create <标题> [类型] [风格]' }
      const genre = parts[1]
      const tone = parts[2]
      const book = createBook(ctx.dataDir, title, genre, tone)
      if (!book) return { type: 'text', content: '创建书籍失败，请稍后重试。' }
      // Auto-select the new book
      setSession(ctx.dataDir, ctx.sessionKey, {
        type: ctx.sessionKey.startsWith('group:') ? 'group' : 'user',
        currentBookId: book.book_id,
        lastActiveAt: new Date().toISOString(),
      })
      return { type: 'text', content: `书籍「${book.title}」已创建并自动选中。\nID: ${book.book_id}` }
    }

    case 'select':
    case '选择': {
      const bookId = args.trim()
      if (!bookId) return { type: 'text', content: '用法: /select <bookId>\n发送 /list 查看所有书籍。' }
      const book = getBookMeta(ctx.dataDir, bookId)
      if (!book) return { type: 'text', content: `未找到书籍: ${bookId}` }
      setSession(ctx.dataDir, ctx.sessionKey, {
        type: ctx.sessionKey.startsWith('group:') ? 'group' : 'user',
        currentBookId: bookId,
        lastActiveAt: new Date().toISOString(),
      })
      return { type: 'card', cardJson: buildBookInfoCard(book as any) }
    }

    case 'current':
    case '当前': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '未选择书籍。发送 /list 查看书列表。' }
      const book = getBookMeta(ctx.dataDir, session.currentBookId)
      if (!book) return { type: 'text', content: '当前书籍不存在，请重新选择。' }
      return { type: 'card', cardJson: buildBookInfoCard(book as any) }
    }

    case 'outline':
    case '大纲': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const outline = readOutline(ctx.dataDir, session.currentBookId)
      return { type: 'card', cardJson: buildOutlineCard(outline) }
    }

    case 'lore':
    case '设定': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const lore = readLore(ctx.dataDir, session.currentBookId)
      return { type: 'card', cardJson: buildLoreCard(lore) }
    }

    case 'chapters':
    case '章节': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const chapters = listChapters(ctx.dataDir, session.currentBookId)
      return { type: 'card', cardJson: buildChapterListCard(chapters) }
    }

    case 'review':
    case '审稿': {
      const chapterId = args.trim()
      if (!chapterId) return { type: 'text', content: '用法: /review <chapterId>\n发送 /chapters 查看章节列表。' }
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const review = readReview(ctx.dataDir, session.currentBookId, chapterId)
      if (!review) return { type: 'text', content: `未找到审稿结果: ${chapterId}` }
      return { type: 'card', cardJson: buildReviewCard(review) }
    }

    case 'clear':
    case '清空': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const { saveHistory } = await import('../routes/chat-history.js')
      saveHistory(ctx.dataDir, session.currentBookId, [])
      return { type: 'text', content: '对话历史已清空。' }
    }

    case 'history':
    case '历史': {
      const session = getSession(ctx.dataDir, ctx.sessionKey)
      if (!session?.currentBookId) return { type: 'text', content: '请先选择书籍。' }
      const { loadHistory } = await import('../routes/chat-history.js')
      const history = loadHistory(ctx.dataDir, session.currentBookId)
      return { type: 'text', content: `当前对话: ${history.length} 条消息` }
    }

    default:
      return { type: 'text', content: `未知命令: /${command}\n发送 /help 查看帮助。` }
  }
}
