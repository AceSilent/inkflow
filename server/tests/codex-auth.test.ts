/**
 * Tests for the Codex OAuth core module (codex-auth, codex-store, loopback).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  generatePkce,
  generateState,
  buildAuthorizeUrl,
  buildRedirectUri,
  decodeJwtPayload,
  extractAccountId,
  extractPlanType,
  exchangeCode,
  refreshTokens,
  accessTokenExpiresSoon,
  CodexAuthError,
  CODEX_CLIENT_ID,
  CODEX_TOKEN_ENDPOINT,
  CODEX_SCOPE,
  type TokenSet,
} from '@/llm/codex-auth.js'

import {
  loadCodexAuth,
  saveCodexAuth,
  clearCodexAuth,
  getFreshAccessToken,
  CODEX_AUTH_FILENAME,
} from '@/llm/codex-store.js'

import { startLoopbackCapture } from '@/llm/loopback-server.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build a fake (unsigned) JWT with the given payload. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  return `${header}.${body}.sig`
}

/** Build a fake id_token carrying the OpenAI auth claim. */
function makeIdToken(opts: { accountId?: string; planType?: string; expMs?: number } = {}): string {
  const payload: Record<string, unknown> = {}
  if (opts.expMs !== undefined) payload.exp = Math.floor(opts.expMs / 1000)
  const auth: Record<string, unknown> = {}
  if (opts.accountId !== undefined) auth['chatgpt_account_id'] = opts.accountId
  if (opts.planType !== undefined) auth['chatgpt_plan_type'] = opts.planType
  payload['https://api.openai.com/auth'] = auth
  return makeJwt(payload)
}

/** Minimal Response-like object for a mocked fetch. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

describe('generatePkce', () => {
  it('produces a verifier within the 43-128 base64url range', () => {
    const { verifier } = generatePkce()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('computes the S256 challenge correctly (base64url(sha256(verifier)) no padding)', () => {
    const { verifier, challenge } = generatePkce()
    const expected = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(challenge).toBe(expected)
    expect(challenge).not.toContain('=')
  })

  it('generates distinct pairs each call', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier)
  })
})

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

describe('buildAuthorizeUrl', () => {
  it('includes every required query parameter', () => {
    const redirectUri = buildRedirectUri(1455)
    const url = buildAuthorizeUrl({ challenge: 'CHAL', state: 'STATE', redirectUri })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://auth.openai.com/oauth/authorize')
    const q = parsed.searchParams
    expect(q.get('response_type')).toBe('code')
    expect(q.get('client_id')).toBe(CODEX_CLIENT_ID)
    expect(q.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
    expect(q.get('scope')).toBe(CODEX_SCOPE)
    expect(q.get('code_challenge')).toBe('CHAL')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('id_token_add_organizations')).toBe('true')
    expect(q.get('codex_cli_simplified_flow')).toBe('true')
    expect(q.get('originator')).toBe('codex_cli_rs')
    expect(q.get('state')).toBe('STATE')
  })

  it('uses localhost (not 127.0.0.1) and the fixed callback path', () => {
    expect(buildRedirectUri(1457)).toBe('http://localhost:1457/auth/callback')
  })

  it('generateState yields a random base64url string', () => {
    const s = generateState()
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s).not.toBe(generateState())
  })
})

// ---------------------------------------------------------------------------
// JWT decode / extract
// ---------------------------------------------------------------------------

describe('decodeJwtPayload / extractAccountId / extractPlanType', () => {
  it('decodes a well-formed JWT payload', () => {
    const jwt = makeJwt({ foo: 'bar', n: 42 })
    expect(decodeJwtPayload(jwt)).toEqual({ foo: 'bar', n: 42 })
  })

  it('extracts chatgpt_account_id and chatgpt_plan_type from the auth claim', () => {
    const jwt = makeIdToken({ accountId: 'acct_123', planType: 'plus' })
    expect(extractAccountId(jwt)).toBe('acct_123')
    expect(extractPlanType(jwt)).toBe('plus')
  })

  it('returns undefined when the account id claim is absent', () => {
    expect(extractAccountId(makeIdToken({}))).toBeUndefined()
    expect(extractAccountId(makeJwt({ unrelated: true }))).toBeUndefined()
  })

  it('throws a clear error on malformed JWTs', () => {
    expect(() => decodeJwtPayload('not-a-jwt')).toThrow(CodexAuthError)
    expect(() => decodeJwtPayload('a.b')).toThrow(/3 dot-separated segments/)
    expect(() => decodeJwtPayload('')).toThrow(/empty or non-string/)
    const badPayload = `${b64url('{}')}.${b64url('not json{')}.${b64url('sig')}`
    expect(() => decodeJwtPayload(badPayload)).toThrow(/not valid JSON/)
  })

  it('extractAccountId tolerates malformed tokens by returning undefined', () => {
    expect(extractAccountId('garbage')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// exchangeCode
// ---------------------------------------------------------------------------

describe('exchangeCode', () => {
  it('posts the correct form body and parses the TokenSet', async () => {
    const idToken = makeIdToken({ accountId: 'acct_xyz', planType: 'pro', expMs: Date.now() + 3600_000 })
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    let capturedBody = ''

    const fetchImpl = (async (url: string, init: RequestInit) => {
      capturedUrl = String(url)
      capturedHeaders = init.headers as Record<string, string>
      capturedBody = String(init.body)
      return jsonResponse({
        id_token: idToken,
        access_token: 'access_abc',
        refresh_token: 'refresh_def',
        expires_in: 3600,
      })
    }) as unknown as typeof fetch

    const tokenSet = await exchangeCode({
      code: 'auth_code_1',
      verifier: 'verifier_1',
      redirectUri: 'http://localhost:1455/auth/callback',
      fetchImpl,
    })

    expect(capturedUrl).toBe(CODEX_TOKEN_ENDPOINT)
    expect(capturedHeaders['Content-Type']).toBe('application/x-www-form-urlencoded')

    const form = new URLSearchParams(capturedBody)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth_code_1')
    expect(form.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
    expect(form.get('client_id')).toBe(CODEX_CLIENT_ID)
    expect(form.get('code_verifier')).toBe('verifier_1')

    expect(tokenSet.access_token).toBe('access_abc')
    expect(tokenSet.refresh_token).toBe('refresh_def')
    expect(tokenSet.id_token).toBe(idToken)
    expect(tokenSet.account_id).toBe('acct_xyz')
    expect(tokenSet.plan_type).toBe('pro')
    expect(tokenSet.expires_at).toBeGreaterThan(Date.now())
  })

  it('throws a CodexAuthError with status on non-2xx', async () => {
    const fetchImpl = (async () =>
      new Response('{"error":"invalid_grant","error_description":"bad code"}', {
        status: 400,
      })) as unknown as typeof fetch

    await expect(
      exchangeCode({ code: 'x', verifier: 'y', redirectUri: 'z', fetchImpl })
    ).rejects.toMatchObject({ name: 'CodexAuthError', code: 'invalid_grant', status: 400 })
  })
})

// ---------------------------------------------------------------------------
// refreshTokens
// ---------------------------------------------------------------------------

describe('refreshTokens', () => {
  it('posts a refresh_token grant and returns the rotated refresh token', async () => {
    let capturedBody = ''
    const newId = makeIdToken({ accountId: 'acct_r', expMs: Date.now() + 3600_000 })
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body)
      return jsonResponse({
        id_token: newId,
        access_token: 'access_new',
        refresh_token: 'refresh_rotated',
        expires_in: 3600,
      })
    }) as unknown as typeof fetch

    const tokenSet = await refreshTokens({ refresh_token: 'refresh_old', fetchImpl })

    const form = new URLSearchParams(capturedBody)
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('refresh_old')
    expect(form.get('client_id')).toBe(CODEX_CLIENT_ID)

    expect(tokenSet.access_token).toBe('access_new')
    expect(tokenSet.refresh_token).toBe('refresh_rotated')
    expect(tokenSet.account_id).toBe('acct_r')
  })

  it('falls back to the old refresh token when the endpoint omits it', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        access_token: 'access_only',
        expires_in: 3600,
      })) as unknown as typeof fetch
    const tokenSet = await refreshTokens({ refresh_token: 'refresh_keep', fetchImpl })
    expect(tokenSet.refresh_token).toBe('refresh_keep')
  })

  it('classifies refresh_token_reused errors', async () => {
    const fetchImpl = (async () =>
      new Response('{"error":"invalid_grant","error_description":"refresh_token_reused"}', {
        status: 400,
      })) as unknown as typeof fetch

    await expect(refreshTokens({ refresh_token: 'used', fetchImpl })).rejects.toMatchObject({
      code: 'refresh_token_reused',
    })
  })
})

// ---------------------------------------------------------------------------
// accessTokenExpiresSoon
// ---------------------------------------------------------------------------

describe('accessTokenExpiresSoon', () => {
  function ts(overrides: Partial<TokenSet>): TokenSet {
    return {
      access_token: 'a',
      refresh_token: 'r',
      id_token: 'i',
      expires_at: Date.now() + 10 * 60 * 1000,
      ...overrides,
    }
  }

  it('is false when the access token JWT exp is far in the future', () => {
    const access = makeJwt({ exp: Math.floor((Date.now() + 60 * 60 * 1000) / 1000) })
    expect(accessTokenExpiresSoon(ts({ access_token: access }))).toBe(false)
  })

  it('is true when the access token JWT exp is within the skew window', () => {
    const access = makeJwt({ exp: Math.floor((Date.now() + 60 * 1000) / 1000) })
    expect(accessTokenExpiresSoon(ts({ access_token: access }))).toBe(true)
  })

  it('falls back to expires_at when the access token is not a decodable JWT', () => {
    expect(accessTokenExpiresSoon(ts({ access_token: 'opaque', expires_at: Date.now() + 60 * 1000 }))).toBe(true)
    expect(accessTokenExpiresSoon(ts({ access_token: 'opaque', expires_at: Date.now() + 60 * 60 * 1000 }))).toBe(false)
  })

  it('treats an undecodable token with bad expires_at as expired', () => {
    expect(accessTokenExpiresSoon(ts({ access_token: 'opaque', expires_at: NaN }))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// codex-store
// ---------------------------------------------------------------------------

describe('codex-store', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-store-'))
  })

  afterEach(async () => {
    await fsp.rm(dataDir, { recursive: true, force: true })
  })

  function tokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
    return {
      access_token: makeJwt({ exp: Math.floor((Date.now() + 60 * 60 * 1000) / 1000) }),
      refresh_token: 'refresh_1',
      id_token: makeIdToken({ accountId: 'acct_store', planType: 'plus' }),
      account_id: 'acct_store',
      expires_at: Date.now() + 60 * 60 * 1000,
      ...overrides,
    }
  }

  it('loadCodexAuth returns null when no credentials exist', async () => {
    expect(await loadCodexAuth(dataDir)).toBeNull()
  })

  it('saves, loads, and clears credentials in auth.json format with 0600 perms', async () => {
    const t = tokenSet()
    await saveCodexAuth(dataDir, t)

    const file = path.join(dataDir, CODEX_AUTH_FILENAME)
    const mode = fs.statSync(file).mode & 0o777
    expect(mode).toBe(0o600)

    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    expect(raw.OPENAI_API_KEY).toBeNull()
    expect(raw.tokens.access_token).toBe(t.access_token)
    expect(raw.tokens.refresh_token).toBe('refresh_1')
    expect(raw.tokens.account_id).toBe('acct_store')
    expect(typeof raw.last_refresh).toBe('string')
    expect(() => new Date(raw.last_refresh).toISOString()).not.toThrow()

    const loaded = await loadCodexAuth(dataDir)
    expect(loaded?.tokens.refresh_token).toBe('refresh_1')

    await clearCodexAuth(dataDir)
    expect(await loadCodexAuth(dataDir)).toBeNull()
    // clear is idempotent
    await expect(clearCodexAuth(dataDir)).resolves.toBeUndefined()
  })

  it('getFreshAccessToken returns the stored token when not near expiry', async () => {
    await saveCodexAuth(dataDir, tokenSet())
    let called = 0
    const fetchImpl = (async () => {
      called++
      return jsonResponse({})
    }) as unknown as typeof fetch

    const { accessToken, accountId } = await getFreshAccessToken(dataDir, { fetchImpl })
    expect(accountId).toBe('acct_store')
    expect(accessToken).toContain('.')
    expect(called).toBe(0) // no refresh needed
  })

  it('getFreshAccessToken refreshes near-expiry tokens and persists the rotated refresh token', async () => {
    // Store a token expiring in 1 minute (inside the 5-minute skew window).
    const expiring = makeJwt({ exp: Math.floor((Date.now() + 60 * 1000) / 1000) })
    await saveCodexAuth(
      dataDir,
      tokenSet({ access_token: expiring, refresh_token: 'refresh_old', expires_at: Date.now() + 60 * 1000 })
    )

    const newAccess = makeJwt({ exp: Math.floor((Date.now() + 60 * 60 * 1000) / 1000) })
    const newId = makeIdToken({ accountId: 'acct_store', planType: 'plus' })
    let capturedRefresh = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedRefresh = new URLSearchParams(String(init.body)).get('refresh_token') ?? ''
      return jsonResponse({
        id_token: newId,
        access_token: newAccess,
        refresh_token: 'refresh_rotated',
        expires_in: 3600,
      })
    }) as unknown as typeof fetch

    const { accessToken, accountId } = await getFreshAccessToken(dataDir, { fetchImpl })
    expect(capturedRefresh).toBe('refresh_old')
    expect(accessToken).toBe(newAccess)
    expect(accountId).toBe('acct_store')

    // The rotated refresh token must be persisted.
    const reloaded = await loadCodexAuth(dataDir)
    expect(reloaded?.tokens.refresh_token).toBe('refresh_rotated')
    expect(reloaded?.tokens.access_token).toBe(newAccess)
  })

  it('getFreshAccessToken coalesces concurrent refreshes into one network call', async () => {
    const expiring = makeJwt({ exp: Math.floor((Date.now() + 60 * 1000) / 1000) })
    await saveCodexAuth(
      dataDir,
      tokenSet({ access_token: expiring, refresh_token: 'refresh_old', expires_at: Date.now() + 60 * 1000 })
    )

    let calls = 0
    const newAccess = makeJwt({ exp: Math.floor((Date.now() + 60 * 60 * 1000) / 1000) })
    const fetchImpl = (async () => {
      calls++
      await new Promise((r) => setTimeout(r, 20))
      return jsonResponse({
        id_token: makeIdToken({ accountId: 'acct_store' }),
        access_token: newAccess,
        refresh_token: 'refresh_rotated',
        expires_in: 3600,
      })
    }) as unknown as typeof fetch

    const [a, b] = await Promise.all([
      getFreshAccessToken(dataDir, { fetchImpl }),
      getFreshAccessToken(dataDir, { fetchImpl }),
    ])
    expect(calls).toBe(1)
    expect(a.accessToken).toBe(newAccess)
    expect(b.accessToken).toBe(newAccess)
  })

  it('getFreshAccessToken throws a clear error when no credentials exist', async () => {
    await expect(getFreshAccessToken(dataDir)).rejects.toMatchObject({ code: 'not_authenticated' })
  })
})

// ---------------------------------------------------------------------------
// loopback-server
// ---------------------------------------------------------------------------

describe('startLoopbackCapture', () => {
  it('resolves the captured code and state, serving a Chinese success page', async () => {
    // Use an ephemeral port to avoid colliding with anything on 1455.
    const capture = await startLoopbackCapture({ port: 0, fallbackPort: 0, timeoutMs: 10_000 })
    try {
      expect(capture.redirectUri).toBe(`http://localhost:${capture.port}/auth/callback`)

      const body = await new Promise<{ status: number; html: string }>((resolve, reject) => {
        const req = http.get(
          `http://localhost:${capture.port}/auth/callback?code=THE_CODE&state=THE_STATE`,
          (res) => {
            let data = ''
            res.on('data', (c) => (data += c))
            res.on('end', () => resolve({ status: res.statusCode ?? 0, html: data }))
          }
        )
        req.on('error', reject)
      })

      expect(body.status).toBe(200)
      expect(body.html).toContain('登录成功')
      expect(body.html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u) // no emoji

      const result = await capture.result
      expect(result).toEqual({ code: 'THE_CODE', state: 'THE_STATE' })
    } finally {
      capture.close()
    }
  })

  it('returns 404 for unrelated paths', async () => {
    const capture = await startLoopbackCapture({ port: 0, fallbackPort: 0, timeoutMs: 10_000 })
    try {
      const status = await new Promise<number>((resolve, reject) => {
        http
          .get(`http://localhost:${capture.port}/nope`, (res) => resolve(res.statusCode ?? 0))
          .on('error', reject)
      })
      expect(status).toBe(404)
    } finally {
      capture.close()
    }
  })

  it('rejects when the callback carries an error param', async () => {
    const capture = await startLoopbackCapture({ port: 0, fallbackPort: 0, timeoutMs: 10_000 })
    try {
      const status = await new Promise<number>((resolve, reject) => {
        http
          .get(`http://localhost:${capture.port}/auth/callback?error=access_denied`, (res) =>
            resolve(res.statusCode ?? 0)
          )
          .on('error', reject)
      })
      expect(status).toBe(400)
      await expect(capture.result).rejects.toThrow(/access_denied/)
    } finally {
      capture.close()
    }
  })
})
