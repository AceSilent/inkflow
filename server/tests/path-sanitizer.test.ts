import { describe, it, expect } from 'vitest'
import { sanitizePathSegment, safeJoin } from '../src/utils/path-sanitizer.js'

describe('sanitizePathSegment', () => {
  it('accepts valid alphanumeric IDs', () => {
    expect(sanitizePathSegment('my_book_1')).toBe('my_book_1')
    expect(sanitizePathSegment('book-123')).toBe('book-123')
    expect(sanitizePathSegment('a')).toBe('a')
  })

  it('accepts unicode characters (Chinese book IDs)', () => {
    expect(sanitizePathSegment('我的小说_abc123')).toBe('我的小说_abc123')
  })

  it('trims whitespace', () => {
    expect(sanitizePathSegment('  book_1  ')).toBe('book_1')
  })

  it('rejects empty string', () => {
    expect(() => sanitizePathSegment('')).toThrow(/non-empty/)
  })

  it('rejects whitespace-only string', () => {
    expect(() => sanitizePathSegment('   ')).toThrow(/empty/)
  })

  it('rejects directory traversal ..', () => {
    expect(() => sanitizePathSegment('../etc/passwd')).toThrow(/traversal/)
  })

  it('rejects path traversal patterns', () => {
    expect(() => sanitizePathSegment('foo/..')).toThrow(/traversal/)
    expect(() => sanitizePathSegment('..')).toThrow(/traversal/)
  })

  it('rejects forward slash', () => {
    expect(() => sanitizePathSegment('foo/bar')).toThrow(/separator/)
  })

  it('rejects backslash', () => {
    expect(() => sanitizePathSegment('foo\\bar')).toThrow(/separator/)
  })

  it('rejects Windows absolute path', () => {
    expect(() => sanitizePathSegment('C:\\Windows')).toThrow(/absolute/)
  })

  it('rejects Unix absolute path', () => {
    expect(() => sanitizePathSegment('/etc/passwd')).toThrow(/absolute/)
  })

  it('rejects null bytes', () => {
    expect(() => sanitizePathSegment('foo\0bar')).toThrow(/null/)
  })

  it('rejects overly long segments', () => {
    const long = 'a'.repeat(129)
    expect(() => sanitizePathSegment(long)).toThrow(/too long/)
  })

  it('accepts max-length segment', () => {
    const exact = 'a'.repeat(128)
    expect(sanitizePathSegment(exact)).toBe(exact)
  })

  it('uses custom label in error', () => {
    expect(() => sanitizePathSegment('', 'bookId')).toThrow(/bookId/)
  })
})

describe('safeJoin', () => {
  it('joins valid segments', () => {
    const result = safeJoin('/data', 'books', 'my_book')
    expect(result).toContain('books')
    expect(result).toContain('my_book')
  })

  it('rejects traversal in joined path', () => {
    expect(() => safeJoin('/data', '..')).toThrow(/traversal/)
  })

  it('accepts single valid segment', () => {
    const result = safeJoin('/data', 'mybook')
    expect(result).toContain('mybook')
  })
})
