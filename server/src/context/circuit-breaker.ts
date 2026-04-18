import fs from 'fs'
import path from 'path'

export interface BreakerState {
  consecutiveFailures: number
  tripped: boolean
  lastFailureAt?: string
}

export const MAX_FAILS = 3

function breakerFile(bookDir: string): string {
  return path.join(bookDir, 'compact_breaker.json')
}

export function loadBreakerState(bookDir: string): BreakerState {
  const f = breakerFile(bookDir)
  if (!fs.existsSync(f)) return { consecutiveFailures: 0, tripped: false }
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
    return {
      consecutiveFailures: Number(raw.consecutiveFailures ?? 0),
      tripped: Boolean(raw.tripped ?? false),
      lastFailureAt: raw.lastFailureAt,
    }
  } catch {
    return { consecutiveFailures: 0, tripped: false }
  }
}

function saveBreakerState(bookDir: string, state: BreakerState): void {
  fs.writeFileSync(breakerFile(bookDir), JSON.stringify(state, null, 2), 'utf8')
}

export function recordFailure(bookDir: string): BreakerState {
  const state = loadBreakerState(bookDir)
  state.consecutiveFailures += 1
  state.lastFailureAt = new Date().toISOString()
  if (state.consecutiveFailures >= MAX_FAILS) state.tripped = true
  saveBreakerState(bookDir, state)
  return state
}

export function recordSuccess(bookDir: string): BreakerState {
  const state: BreakerState = { consecutiveFailures: 0, tripped: false }
  saveBreakerState(bookDir, state)
  return state
}

export function resetBreaker(bookDir: string): BreakerState {
  return recordSuccess(bookDir)
}

export function isTripped(state: BreakerState): boolean {
  return state.tripped
}
