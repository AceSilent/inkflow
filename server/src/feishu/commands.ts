/**
 * Feishu command parser and handlers.
 * Commands start with '/' — everything else is free text → Agent chat.
 */
import fs from 'fs'
import path from 'path'
import { type CommandContext, type CommandResult } from './types.js'
import { setSession, getSession } from './session.js'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'
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
  const out: any[] = []
  for (const name of fs.readdirSync(dir)) {
    const meta = safeReadJson<any>(path.join(dir, name, '00_Config', 'book_meta.json'))
    if (meta) out.push({ book_id: name, ...meta })
  }
  return out
}

function getBookMeta(dataDir: string, bookId: string) {
  const meta = safeReadJson<any>(path.join(booksDir(dataDir), bookId, '00_Config', 'book_meta.json'))
  return meta ? { book_id: bookId, ...meta } : null
}

function readOutline(dataDir: string, bookId: string) {
  return safeReadJson(path.join(booksDir(dataDir), bookId, '02_Outlines', 'outline.json'))
}

function readLore(dataDir: string, bookId: string) {
  const bookRoot = path.join(booksDir(dataDir), bookId)
  return {
    meta: safeReadJson(path.join(bookRoot, '00_Config', 'book_meta.json')),
    world_setting: safeReadJson(path.join(bookRoot, '01_Global_Settings', 'world_lore.json')),
    characters: safeReadJson(path.join(bookRoot, '01_Global_Settings', 'characters.json')),
  }
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
  return safeReadJson(path.join(booksDir(dataDir), bookId, '04_Drafts', `review_${chapterId}.json`))
}

function createBook(dataDir: string, title: string, genre?: string, tone?: string): { book_id: string; title: string } | null {
  const rawId = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').slice(0, 30)
  const suffix = Math.random().toString(36).slice(2, 10)
  const bookId = `${rawId}_${suffix}`
  const bookDir = path.join(booksDir(dataDir), bookId)

  try {
    for (const sub of ['00_Config', '01_Global_Settings', '02_Outlines', '04_Drafts']) {
      ensureDir(path.join(bookDir, sub))
    }
    const meta = { title, genre: genre || '', tone: tone || '', target_words: 100000, created_at: new Date().toISOString() }
    writeJson(path.join(bookDir, '00_Config', 'book_meta.json'), meta)
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
