/**
 * Path Sanitizer — prevents directory traversal attacks.
 *
 * All route params (bookId, chapterId) MUST be sanitized before
 * being passed to path.join(). This module provides a single
 * `sanitizePathSegment()` function that rejects dangerous inputs.
 */
import path from 'path'

/**
 * Sanitize a path segment to prevent directory traversal.
 * Rejects: empty strings, `..`, absolute paths, null bytes, path separators.
 * Returns the cleaned segment or throws.
 */
export function sanitizePathSegment(segment: string, label = 'id'): string {
  if (!segment || typeof segment !== 'string') {
    throw new Error(`Invalid ${label}: must be a non-empty string`)
  }

  const trimmed = segment.trim()

  if (trimmed.length === 0) {
    throw new Error(`Invalid ${label}: empty after trimming`)
  }

  if (trimmed.includes('..')) {
    throw new Error(`Invalid ${label}: directory traversal not allowed`)
  }

  if (/^[A-Za-z]:/.test(trimmed) || trimmed.startsWith('/')) {
    throw new Error(`Invalid ${label}: absolute paths not allowed`)
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Invalid ${label}: path separators not allowed`)
  }

  if (trimmed.includes('\0')) {
    throw new Error(`Invalid ${label}: null bytes not allowed`)
  }

  if (trimmed.length > 128) {
    throw new Error(`Invalid ${label}: too long (max 128 characters)`)
  }

  return trimmed
}

/**
 * Build a safe path under baseDir from sanitized segments.
 * Resolves both paths and verifies the result stays within baseDir.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const sanitized = segments.map((s, i) =>
    sanitizePathSegment(s, `segment[${i}]`)
  )
  const target = path.join(baseDir, ...sanitized)
  const resolvedTarget = path.resolve(target)
  const resolvedBase = path.resolve(baseDir)

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error('Path escapes base directory')
  }

  return target
}
