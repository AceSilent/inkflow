/**
 * Tests for custom error types.
 */
import { describe, it, expect } from 'vitest'
import {
  AgentError,
  AbortError,
  ToolExecutionError,
  LLMError,
  ValidationError,
  isAbortError,
  isAgentError,
} from '../src/utils/errors.js'

describe('Error Types', () => {
  it('AgentError has code property', () => {
    const err = new AgentError('test', 'TEST_CODE')
    expect(err.message).toBe('test')
    expect(err.code).toBe('TEST_CODE')
    expect(err.name).toBe('AgentError')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AgentError)
  })

  it('AbortError has correct defaults', () => {
    const err = new AbortError()
    expect(err.message).toBe('Operation aborted by client')
    expect(err.code).toBe('ABORT')
    expect(err.name).toBe('AbortError')
  })

  it('AbortError accepts custom message', () => {
    const err = new AbortError('Custom abort')
    expect(err.message).toBe('Custom abort')
  })

  it('ToolExecutionError includes tool name', () => {
    const err = new ToolExecutionError('save_draft', 'disk full')
    expect(err.toolName).toBe('save_draft')
    expect(err.message).toContain('save_draft')
    expect(err.message).toContain('disk full')
    expect(err.code).toBe('TOOL_ERROR')
    expect(err.name).toBe('ToolExecutionError')
  })

  it('LLMError includes status code', () => {
    const err = new LLMError('Rate limited', 429)
    expect(err.message).toBe('Rate limited')
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe('LLM_ERROR')
    expect(err.name).toBe('LLMError')
  })

  it('LLMError works without status code', () => {
    const err = new LLMError('Connection refused')
    expect(err.statusCode).toBeUndefined()
  })

  it('ValidationError includes field name', () => {
    const err = new ValidationError('book_id is required', 'book_id')
    expect(err.field).toBe('book_id')
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.name).toBe('ValidationError')
  })

  it('ValidationError works without field', () => {
    const err = new ValidationError('Invalid input')
    expect(err.field).toBeUndefined()
  })
})

describe('Error Type Guards', () => {
  it('isAbortError detects AbortError instances', () => {
    expect(isAbortError(new AbortError())).toBe(true)
  })

  it('isAbortError detects native AbortError name', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('isAbortError rejects non-abort errors', () => {
    expect(isAbortError(new Error('other'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('string')).toBe(false)
  })

  it('isAgentError detects all AgentError subclasses', () => {
    expect(isAgentError(new AgentError('test', 'X'))).toBe(true)
    expect(isAgentError(new AbortError())).toBe(true)
    expect(isAgentError(new ToolExecutionError('t', 'msg'))).toBe(true)
    expect(isAgentError(new LLMError('msg'))).toBe(true)
    expect(isAgentError(new ValidationError('msg'))).toBe(true)
  })

  it('isAgentError rejects non-AgentError', () => {
    expect(isAgentError(new Error('plain'))).toBe(false)
    expect(isAgentError(null)).toBe(false)
  })
})
