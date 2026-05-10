/**
 * Tests for Zod route schemas — validates input parsing and rejection.
 */
import { describe, it, expect } from 'vitest'
import {
  bookIdParam,
  chapterIdParam,
  createBookBody,
  sendChatBody,
  providerSchema,
  saveSettingsBody,
  outlineBody,
} from '../src/routes/schemas.js'

// ── bookIdParam ──

describe('bookIdParam', () => {
  it('accepts valid book ID', () => {
    expect(bookIdParam.parse({ bookId: 'my-book-123' })).toEqual({ bookId: 'my-book-123' })
  })

  it('accepts Chinese book ID', () => {
    expect(bookIdParam.parse({ bookId: '测试小说' })).toEqual({ bookId: '测试小说' })
  })

  it('rejects empty bookId', () => {
    expect(() => bookIdParam.parse({ bookId: '' })).toThrow()
  })

  it('rejects missing bookId', () => {
    expect(() => bookIdParam.parse({})).toThrow()
  })

  it('rejects oversized bookId', () => {
    expect(() => bookIdParam.parse({ bookId: 'x'.repeat(129) })).toThrow()
  })
})

// ── chapterIdParam ──

describe('chapterIdParam', () => {
  it('accepts valid params', () => {
    expect(chapterIdParam.parse({ bookId: 'book1', chapterId: 'ch1' })).toEqual({
      bookId: 'book1',
      chapterId: 'ch1',
    })
  })

  it('rejects missing chapterId', () => {
    expect(() => chapterIdParam.parse({ bookId: 'book1' })).toThrow()
  })

  it('rejects empty chapterId', () => {
    expect(() => chapterIdParam.parse({ bookId: 'book1', chapterId: '' })).toThrow()
  })
})

// ── createBookBody ──

describe('createBookBody', () => {
  const valid = {
    book_id: 'test-book',
    title: 'Test Novel',
    genre: '玄幻',
    tone: '热血',
    target_words: 100000,
  }

  it('accepts valid book creation body', () => {
    expect(createBookBody.parse(valid)).toEqual(valid)
  })

  it('rejects missing book_id', () => {
    const { book_id, ...noId } = valid
    expect(() => createBookBody.parse(noId)).toThrow()
  })

  it('rejects empty title', () => {
    expect(() => createBookBody.parse({ ...valid, title: '' })).toThrow()
  })

  it('rejects negative target_words', () => {
    expect(() => createBookBody.parse({ ...valid, target_words: -100 })).toThrow()
  })

  it('rejects zero target_words', () => {
    expect(() => createBookBody.parse({ ...valid, target_words: 0 })).toThrow()
  })

  it('rejects non-integer target_words', () => {
    expect(() => createBookBody.parse({ ...valid, target_words: 1.5 })).toThrow()
  })

  it('rejects oversized title (>200 chars)', () => {
    expect(() => createBookBody.parse({ ...valid, title: 'x'.repeat(201) })).toThrow()
  })

  it('rejects oversized genre (>50 chars)', () => {
    expect(() => createBookBody.parse({ ...valid, genre: 'x'.repeat(51) })).toThrow()
  })

  it('rejects extra-large target_words', () => {
    expect(() => createBookBody.parse({ ...valid, target_words: 10000001 })).toThrow()
  })
})

// ── sendChatBody ──

describe('sendChatBody', () => {
  it('accepts valid message', () => {
    expect(sendChatBody.parse({ message: 'Hello' })).toEqual({ message: 'Hello' })
  })

  it('accepts message with brainstorm mode', () => {
    expect(sendChatBody.parse({ message: 'Hello', mode: 'brainstorm' })).toEqual({
      message: 'Hello',
      mode: 'brainstorm',
    })
  })

  it('accepts message with author mode', () => {
    expect(sendChatBody.parse({ message: 'Hello', mode: 'author' })).toEqual({
      message: 'Hello',
      mode: 'author',
    })
  })

  it('rejects empty message', () => {
    expect(() => sendChatBody.parse({ message: '' })).toThrow()
  })

  it('rejects missing message', () => {
    expect(() => sendChatBody.parse({})).toThrow()
  })

  it('rejects oversized message (>50000)', () => {
    expect(() => sendChatBody.parse({ message: 'x'.repeat(50001) })).toThrow()
  })

  it('rejects invalid mode', () => {
    expect(() => sendChatBody.parse({ message: 'hi', mode: 'invalid' })).toThrow()
  })

  it('accepts message without mode (optional)', () => {
    const result = sendChatBody.parse({ message: 'test' })
    expect(result).toEqual({ message: 'test' })
  })
})

// ── providerSchema ──

describe('providerSchema', () => {
  const valid = {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-key',
    models: ['gpt-4o', 'gpt-4o-mini'],
  }

  it('accepts valid provider', () => {
    expect(providerSchema.parse(valid)).toEqual(valid)
  })

  it('accepts empty apiKey', () => {
    expect(providerSchema.parse({ ...valid, apiKey: '' })).toBeDefined()
  })

  it('accepts empty models array', () => {
    expect(providerSchema.parse({ ...valid, models: [] })).toBeDefined()
  })

  it('rejects empty id', () => {
    expect(() => providerSchema.parse({ ...valid, id: '' })).toThrow()
  })

  it('rejects invalid baseUrl', () => {
    expect(() => providerSchema.parse({ ...valid, baseUrl: 'not-a-url' })).toThrow()
  })

  it('rejects oversized models array (>50)', () => {
    expect(() => providerSchema.parse({ ...valid, models: Array(51).fill('model') })).toThrow()
  })
})

// ── saveSettingsBody ──

describe('saveSettingsBody', () => {
  const validProvider = {
    id: 'test',
    name: 'Test',
    baseUrl: 'https://api.test.com',
    apiKey: 'key',
    models: ['model-1'],
  }

  it('accepts valid settings', () => {
    const body = {
      providers: [validProvider],
      authorModel: 'test/model-1',
      editorModel: 'test/model-1',
      reviewerModels: {
        editorial_lore: 'test/model-1',
        editorial_ai_tone: '',
      },
    }
    expect(saveSettingsBody.parse(body)).toEqual(body)
  })

  it('accepts empty providers', () => {
    expect(() => saveSettingsBody.parse({
      providers: [],
      authorModel: '',
      editorModel: '',
    })).not.toThrow()
  })

  it('rejects too many providers (>10)', () => {
    expect(() => saveSettingsBody.parse({
      providers: Array(11).fill(validProvider),
      authorModel: '',
      editorModel: '',
    })).toThrow()
  })

  it('rejects invalid provider inside array', () => {
    expect(() => saveSettingsBody.parse({
      providers: [{ id: '', name: 'Bad' }],
      authorModel: '',
      editorModel: '',
    })).toThrow()
  })
})

// ── outlineBody ──

describe('outlineBody', () => {
  const valid = {
    id: 'book-1',
    label: 'My Novel',
    type: 'book' as const,
    children: [],
  }

  it('accepts valid outline', () => {
    expect(outlineBody.parse(valid)).toEqual(valid)
  })

  it('accepts outline with children', () => {
    const withChildren = {
      ...valid,
      children: [
        { id: 'v1', label: 'Volume 1', type: 'volume', children: [] },
      ],
    }
    expect(outlineBody.parse(withChildren)).toEqual(withChildren)
  })

  it('rejects wrong type', () => {
    expect(() => outlineBody.parse({ ...valid, type: 'volume' })).toThrow()
  })

  it('rejects non-array children', () => {
    expect(() => outlineBody.parse({ ...valid, children: 'not-array' })).toThrow()
  })

  it('rejects oversized children (>1000)', () => {
    expect(() => outlineBody.parse({ ...valid, children: Array(1001).fill({}) })).toThrow()
  })
})
