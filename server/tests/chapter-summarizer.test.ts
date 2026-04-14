import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const seenPrompts: string[] = []
let mockResponse: any = {
  summary: '林辰在外门第三年重生，主动出击改写前世结局，引起长老警觉。',
  character_states: {
    林辰: '决定隐藏实力暗中布局；身体仍是练气二层',
    苏婉: '对林辰的反常感到困惑',
  },
}

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(async (opts: { prompt: string }) => {
      seenPrompts.push(opts.prompt)
      return { text: JSON.stringify(mockResponse) } as any
    }),
  }
})

let tmpDir: string
const bookId = 'book'
const PROMPTS_DIR = path.resolve(__dirname, '../../prompts')

beforeEach(() => {
  seenPrompts.length = 0
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summarizer-'))
  fs.mkdirSync(path.join(tmpDir, bookId), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const llmConfig = { apiKey: 'test', baseURL: 'https://example.com/v1', model: 'mock-model' }

describe('summarizeChapter', () => {
  it('should call LLM with the rendered template (chapter_id + label + draft injected)', async () => {
    const { summarizeChapter } = await import('../src/memory/chapter-summarizer.js')
    const result = await summarizeChapter({
      chapterId: 'ch01',
      chapterLabel: '重生归来',
      draftText: 'UNIQUE_DRAFT_MARKER 林辰睁开眼。',
      llmConfig,
      promptsDir: PROMPTS_DIR,
    })
    expect(seenPrompts).toHaveLength(1)
    expect(seenPrompts[0]).toContain('ch01')
    expect(seenPrompts[0]).toContain('重生归来')
    expect(seenPrompts[0]).toContain('UNIQUE_DRAFT_MARKER')
    // No raw Jinja placeholders should leak.
    expect(seenPrompts[0]).not.toMatch(/\{\{[^}]*\}\}/)

    expect(result.summary).toContain('林辰')
    expect(result.character_states['林辰']).toContain('隐藏')
  })

  it('should strip markdown fences from LLM JSON', async () => {
    mockResponse = `\`\`\`json\n${JSON.stringify({ summary: 'fenced ok', character_states: {} })}\n\`\`\``
    // The mock above returns `text: JSON.stringify(mockResponse)` — but for this
    // case we want raw fenced text in `text`. Override the mock inline.
    const aiModule = await import('ai')
    const spy = vi.mocked(aiModule.generateText)
    spy.mockImplementationOnce(async () => ({ text: mockResponse } as any))

    const { summarizeChapter } = await import('../src/memory/chapter-summarizer.js')
    const result = await summarizeChapter({
      chapterId: 'ch01',
      chapterLabel: 'x',
      draftText: 'draft',
      llmConfig,
      promptsDir: PROMPTS_DIR,
    })
    expect(result.summary).toBe('fenced ok')

    // Reset for other tests.
    mockResponse = {
      summary: '林辰在外门第三年重生，主动出击改写前世结局，引起长老警觉。',
      character_states: { 林辰: '决定隐藏实力' },
    }
  })

  it('should drop empty/non-string character_state entries silently', async () => {
    const aiModule = await import('ai')
    vi.mocked(aiModule.generateText).mockImplementationOnce(async () => ({
      text: JSON.stringify({
        summary: 's',
        character_states: { good: 'real state', empty: '', notString: 42 },
      }),
    } as any))

    const { summarizeChapter } = await import('../src/memory/chapter-summarizer.js')
    const result = await summarizeChapter({
      chapterId: 'ch01', chapterLabel: '', draftText: 'd', llmConfig, promptsDir: PROMPTS_DIR,
    })
    expect(result.character_states).toEqual({ good: 'real state' })
  })

  it('should throw on un-parseable LLM response', async () => {
    const aiModule = await import('ai')
    vi.mocked(aiModule.generateText).mockImplementationOnce(async () => ({
      text: 'not json at all',
    } as any))

    const { summarizeChapter } = await import('../src/memory/chapter-summarizer.js')
    await expect(summarizeChapter({
      chapterId: 'ch01', chapterLabel: '', draftText: 'd', llmConfig, promptsDir: PROMPTS_DIR,
    })).rejects.toThrow(/failed to parse/)
  })
})

describe('persistChapterSummary', () => {
  it('should write summary to plot_progress and character_states', async () => {
    const { persistChapterSummary } = await import('../src/memory/chapter-summarizer.js')
    await persistChapterSummary({
      dataDir: tmpDir,
      bookId,
      chapterId: 'ch01',
      draftText: 'long draft '.repeat(50),
      llmConfig,
      promptsDir: PROMPTS_DIR,
    })

    const plotPath = path.join(tmpDir, bookId, 'memory', 'plot_progress.json')
    const charPath = path.join(tmpDir, bookId, 'memory', 'character_states.json')
    expect(fs.existsSync(plotPath)).toBe(true)
    expect(fs.existsSync(charPath)).toBe(true)

    const plot = JSON.parse(fs.readFileSync(plotPath, 'utf-8'))
    expect(plot[0].chapter_id).toBe('ch01')
    expect(plot[0].summary).toContain('林辰')

    const chars = JSON.parse(fs.readFileSync(charPath, 'utf-8'))
    expect(chars['林辰'][0].state).toContain('隐藏')
  })

  it('should not throw on LLM failure (logged + null returned)', async () => {
    const aiModule = await import('ai')
    vi.mocked(aiModule.generateText).mockImplementationOnce(async () => {
      throw new Error('LLM exploded')
    })

    const { persistChapterSummary } = await import('../src/memory/chapter-summarizer.js')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await persistChapterSummary({
      dataDir: tmpDir, bookId, chapterId: 'ch01', draftText: 'd', llmConfig, promptsDir: PROMPTS_DIR,
    })
    expect(result).toBeNull()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('should look up chapter label from outline.json when present', async () => {
    fs.mkdirSync(path.join(tmpDir, bookId, '02_Outlines'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, bookId, '02_Outlines', 'outline.json'),
      JSON.stringify({
        id: bookId, type: 'book', label: 't',
        children: [{
          id: 'v1', type: 'volume', label: 'v',
          children: [{ id: 'ch07', type: 'chapter', label: 'EXPECTED_LABEL', summary: '' }],
        }],
      }),
    )

    const { persistChapterSummary } = await import('../src/memory/chapter-summarizer.js')
    await persistChapterSummary({
      dataDir: tmpDir, bookId, chapterId: 'ch07', draftText: 'd', llmConfig, promptsDir: PROMPTS_DIR,
    })
    expect(seenPrompts.at(-1)).toContain('EXPECTED_LABEL')
  })
})
