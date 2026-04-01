/**
 * Tool safety layer — audit logging, auto-backup, input validation.
 * Inspired by Claude Code's Fail-Closed permission system.
 */
import fs from 'fs'
import path from 'path'

export const MAX_ARG_LENGTH = 50_000

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
  /system\s*:\s*you\s+are/i,
  /<\s*\/?\s*system\s*>/i,
]

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputValidationError'
  }
}

export function validateInput(toolName: string, args: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue
    if (value.length > MAX_ARG_LENGTH) {
      throw new InputValidationError(
        `Argument '${key}' for tool '${toolName}' exceeds max length (${value.length} > ${MAX_ARG_LENGTH})`
      )
    }
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        throw new InputValidationError(
          `Possible prompt injection detected in '${key}' for tool '${toolName}'`
        )
      }
    }
  }
}

export function createBackup(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null
  const backup = filePath + '.bak'
  fs.copyFileSync(filePath, backup)
  return backup
}

export function appendAuditLog(
  logFile: string,
  toolName: string,
  args: Record<string, unknown>,
  resultSummary: string,
  success: boolean
): void {
  const safeArgs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 200) {
      safeArgs[k] = v.slice(0, 200) + `...[${v.length} chars]`
    } else {
      safeArgs[k] = v
    }
  }

  const entry = {
    ts: Date.now() / 1000,
    tool: toolName,
    args: safeArgs,
    result: resultSummary.slice(0, 200),
    success,
  }

  const dir = path.dirname(logFile)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')
}
