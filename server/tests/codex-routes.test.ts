/**
 * Tests for the Codex OAuth login route plugin.
 *
 * The loopback capture and the token exchange are injected so the whole
 * start → status → logout flow runs offline (no real OpenAI / browser / port).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { codexAuthRoutes } from '../src/routes/codex-auth.js'
import type { LoopbackCapture } from '../src/llm/loopback-server.js'
import type { TokenSet } from '../src/llm/codex-auth.js'
import { CODEX_AUTH_FILENAME } from '../src/llm/codex-store.js'

// ---------------------------------------------------------------------------
// JWT helpers (mirror codex-auth.test.ts)
// ---------------------------------------------------------------------------

function b64url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeIdToken(opts: { accountId?: string; planType?: string; expMs?: number } = {}): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload: Record<string, unknown> = {}
  if (opts.expMs !== undefined) payload.exp = Math.floor(opts.expMs / 1000)
  const auth: Record<string, unknown> = {}
  if (opts.accountId !== undefined) auth['chatgpt_account_id'] = opts.accountId
  if (opts.planType !== undefined) auth['chatgpt_plan_type'] = opts.planType
  payload['https://api.openai.com/auth'] = auth
  const body = b64url(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

function makeTokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  const idToken = makeIdToken({
    accountId: 'acc-123',
    planType: 'plus',
    expMs: Date.now() + 60 * 60 * 1000,
  })
  return {
    access_token: makeIdToken({ accountId: 'acc-123', expMs: Date.now() + 60 * 60 * 1000 }),
    refresh_token: 'refresh-abc',
    id_token: idToken,
    account_id: 'acc-123',
    plan_type: 'plus',
    expires_at: Date.now() + 60 * 60 * 1000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Controllable fake loopback capture
// ---------------------------------------------------------------------------

interface FakeLoopback {
  capture: LoopbackCapture
  /** Fire the OAuth callback the loopback server would have received. */
  fire: (value: { code: string; state: string }) => void
  closed: boolean
}

function makeFakeLoopback(): FakeLoopback {
  let resolveResult!: (v: { code: string; state: string }) => void
  const result = new Promise<{ code: string; state: string }>((resolve) => {
    resolveResult = resolve
  })
  const handle: FakeLoopback = {
    closed: false,
    fire: (v) => resolveResult(v),
    capture: {
      port: 1455,
      redirectUri: 'http://localhost:1455/auth/callback',
      result,
      close: () => { handle.closed = true },
    },
  }
  return handle
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let tmpDir: string

async function buildApp(opts: {
  fake?: FakeLoopback
  exchange?: (input: { code: string; verifier: string; redirectUri: string }) => Promise<TokenSet>
} = {}): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(codexAuthRoutes, {
    prefix: '/api/v1',
    dataDir: tmpDir,
    startLoopback: async () => {
      const fake = opts.fake ?? makeFakeLoopback()
      return fake.capture
    },
    exchange: (opts.exchange ?? (async () => makeTokenSet())) as any,
  })
  return app
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-routes-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Poll status until it leaves 'pending' or the attempt budget is exhausted. */
async function waitForSettled(app: FastifyInstance): Promise<any> {
  for (let i = 0; i < 50; i++) {
    const r = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/status' })
    const body = r.json()
    if (body.state !== 'pending') return body
    await new Promise((res) => setTimeout(res, 5))
  }
  throw new Error('login flow never settled')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('codex auth routes', () => {
  it('start → success: exchanges code, persists credentials, reports success', async () => {
    const fake = makeFakeLoopback()
    let exchangedWith: any
    const app = await buildApp({
      fake,
      exchange: async (input) => {
        exchangedWith = input
        return makeTokenSet()
      },
    })

    // idle before start
    const idle = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/status' })
    expect(idle.json().state).toBe('idle')

    const startRes = await app.inject({ method: 'POST', url: '/api/v1/auth/codex/start' })
    expect(startRes.statusCode).toBe(200)
    const startBody = startRes.json()
    expect(startBody.port).toBe(1455)
    const authorizeUrl = new URL(startBody.authorize_url)
    const expectedState = authorizeUrl.searchParams.get('state')!
    expect(expectedState).toBeTruthy()

    // pending while waiting on the callback
    const pending = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/status' })
    expect(pending.json().state).toBe('pending')

    // Fire the callback with the matching state.
    fake.fire({ code: 'auth-code-1', state: expectedState })

    const settled = await waitForSettled(app)
    expect(settled.state).toBe('success')
    expect(settled.account_id).toBe('acc-123')
    expect(settled.plan_type).toBe('plus')

    // exchange received the verifier and redirect URI we built the URL from.
    expect(exchangedWith.code).toBe('auth-code-1')
    expect(exchangedWith.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(exchangedWith.redirectUri).toBe('http://localhost:1455/auth/callback')

    // credentials landed on disk.
    const file = path.join(tmpDir, CODEX_AUTH_FILENAME)
    expect(fs.existsSync(file)).toBe(true)
    const stored = JSON.parse(await fsp.readFile(file, 'utf-8'))
    expect(stored.tokens.account_id).toBe('acc-123')
    expect(stored.OPENAI_API_KEY).toBeNull()

    // loopback was closed.
    expect(fake.closed).toBe(true)

    await app.close()
  })

  it('start → error on state mismatch (CSRF guard), does not persist', async () => {
    const fake = makeFakeLoopback()
    let exchangeCalled = false
    const app = await buildApp({
      fake,
      exchange: async () => { exchangeCalled = true; return makeTokenSet() },
    })

    await app.inject({ method: 'POST', url: '/api/v1/auth/codex/start' })

    // Fire with a deliberately wrong state.
    fake.fire({ code: 'auth-code-2', state: 'attacker-controlled-state' })

    const settled = await waitForSettled(app)
    expect(settled.state).toBe('error')
    expect(settled.message).toMatch(/state/i)
    expect(exchangeCalled).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, CODEX_AUTH_FILENAME))).toBe(false)

    await app.close()
  })

  it('start → error when exchange fails', async () => {
    const fake = makeFakeLoopback()
    const app = await buildApp({
      fake,
      exchange: async () => { throw new Error('invalid_grant') },
    })

    const startRes = await app.inject({ method: 'POST', url: '/api/v1/auth/codex/start' })
    const expectedState = new URL(startRes.json().authorize_url).searchParams.get('state')!
    fake.fire({ code: 'auth-code-3', state: expectedState })

    const settled = await waitForSettled(app)
    expect(settled.state).toBe('error')
    expect(settled.message).toMatch(/invalid_grant/)
    expect(fs.existsSync(path.join(tmpDir, CODEX_AUTH_FILENAME))).toBe(false)

    await app.close()
  })

  it('logout clears stored credentials and resets state to idle', async () => {
    const fake = makeFakeLoopback()
    const app = await buildApp({ fake })

    const startRes = await app.inject({ method: 'POST', url: '/api/v1/auth/codex/start' })
    const expectedState = new URL(startRes.json().authorize_url).searchParams.get('state')!
    fake.fire({ code: 'auth-code-4', state: expectedState })
    await waitForSettled(app)
    expect(fs.existsSync(path.join(tmpDir, CODEX_AUTH_FILENAME))).toBe(true)

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/codex/logout' })
    expect(logout.statusCode).toBe(200)
    expect(logout.json().status).toBe('ok')
    expect(fs.existsSync(path.join(tmpDir, CODEX_AUTH_FILENAME))).toBe(false)

    const status = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/status' })
    expect(status.json().state).toBe('idle')

    await app.close()
  })

  it('info reports not-authenticated before login and authenticated after', async () => {
    const fake = makeFakeLoopback()
    const app = await buildApp({ fake })

    const before = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/info' })
    expect(before.json()).toMatchObject({ authenticated: false, token_valid: false })

    const startRes = await app.inject({ method: 'POST', url: '/api/v1/auth/codex/start' })
    const expectedState = new URL(startRes.json().authorize_url).searchParams.get('state')!
    fake.fire({ code: 'auth-code-5', state: expectedState })
    await waitForSettled(app)

    const after = await app.inject({ method: 'GET', url: '/api/v1/auth/codex/info' })
    const info = after.json()
    expect(info.authenticated).toBe(true)
    expect(info.account_id).toBe('acc-123')
    expect(info.plan_type).toBe('plus')
    expect(info.token_valid).toBe(true)

    await app.close()
  })
})
