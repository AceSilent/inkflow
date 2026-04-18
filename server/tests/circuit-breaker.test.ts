import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadBreakerState, recordFailure, recordSuccess, resetBreaker, isTripped, MAX_FAILS } from '../src/context/circuit-breaker.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('circuit-breaker', () => {
  it('fresh state is not tripped', () => {
    const state = loadBreakerState(path.join(tmpDir, 'book1'))
    expect(state.consecutiveFailures).toBe(0)
    expect(state.tripped).toBe(false)
    expect(isTripped(state)).toBe(false)
  })

  it('trips after MAX_FAILS consecutive failures', () => {
    const bookDir = path.join(tmpDir, 'book1')
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.tripped).toBe(true)
    expect(isTripped(state)).toBe(true)
  })

  it('success resets counter', () => {
    const bookDir = path.join(tmpDir, 'book1')
    recordFailure(bookDir)
    recordFailure(bookDir)
    recordSuccess(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.consecutiveFailures).toBe(0)
    expect(state.tripped).toBe(false)
  })

  it('reset clears tripped', () => {
    const bookDir = path.join(tmpDir, 'book1')
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(bookDir)
    resetBreaker(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.tripped).toBe(false)
  })
})
