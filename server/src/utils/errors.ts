/**
 * Custom error types for the Agent system.
 *
 * Inspired by Claude Code's error hierarchy — provides structured
 * error handling with specific types for different failure modes.
 */

/** Base error for all AutoNovel agent errors */
export class AgentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'AgentError'
  }
}

/** Thrown when the user/client aborts a running stream */
export class AbortError extends AgentError {
  constructor(message = 'Operation aborted by client') {
    super(message, 'ABORT')
    this.name = 'AbortError'
  }
}

/** Thrown when a tool execution fails */
export class ToolExecutionError extends AgentError {
  constructor(
    public readonly toolName: string,
    message: string,
  ) {
    super(`Tool '${toolName}' failed: ${message}`, 'TOOL_ERROR')
    this.name = 'ToolExecutionError'
  }
}

/** Thrown when an LLM API call fails */
export class LLMError extends AgentError {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message, 'LLM_ERROR')
    this.name = 'LLMError'
  }
}

/** Thrown when input validation fails */
export class ValidationError extends AgentError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

/** Type guard for AbortError */
export function isAbortError(e: unknown): boolean {
  return (
    e instanceof AbortError ||
    (e instanceof Error && e.name === 'AbortError')
  )
}

/** Type guard for AgentError */
export function isAgentError(e: unknown): boolean {
  return e instanceof AgentError
}
