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

/**
 * Max size (bytes) before the active audit log is rotated.
 * Past the threshold we rename `audit_log.jsonl` → `audit_log.jsonl.1`,
 * shifting older rotations (`.1 → .2 → .3`) and dropping anything beyond
 * AUDIT_KEEP_ROTATIONS. 5MB ≈ tens of thousands of tool calls — plenty
 * of history, but avoids the "100-chapter book = 50MB single file" trap.
 */
export const AUDIT_MAX_BYTES = 5 * 1024 * 1024
export const AUDIT_KEEP_ROTATIONS = 3

function rotateAuditLog(logFile: string): void {
  // Shift .N → .N+1 from the tail inward so we never overwrite the wrong file.
  for (let i = AUDIT_KEEP_ROTATIONS; i >= 1; i--) {
    const src = `${logFile}.${i}`
    if (!fs.existsSync(src)) continue
    if (i === AUDIT_KEEP_ROTATIONS) {
      fs.rmSync(src, { force: true })
    } else {
      fs.renameSync(src, `${logFile}.${i + 1}`)
    }
  }
  if (fs.existsSync(logFile)) {
    fs.renameSync(logFile, `${logFile}.1`)
  }
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

  // Rotate before append so the new entry always lands in a fresh file when
  // the previous one crossed the size threshold. Stat failures (missing file)
  // are benign — fs.statSync throws, so guard with existsSync first.
  if (fs.existsSync(logFile) && fs.statSync(logFile).size >= AUDIT_MAX_BYTES) {
    rotateAuditLog(logFile)
  }

  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')
}
