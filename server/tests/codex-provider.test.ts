/**
 * Tests for the Codex (ChatGPT OAuth) provider transport.
 *
 * These cover everything testable without a live ChatGPT backend:
 *   - required header injection
 *   - request-body rewrite (store:false + reasoning.encrypted_content)
 *   - 401 → token refresh → single retry
 *   - the request-body patch helper in isolation
 *
 * The actual Responses-API request/response shape can only be verified online.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createCodexFetch, patchCodexResponsesBody, resolveCodexModel } from '../src/llm/provider.js'
import { saveCodexAuth } from '../src/llm/codex-store.js'
import type { TokenSet } from '../src/llm/codex-auth.js'

function b64url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  return `${header}.${b64url(JSON.stringify(payload))}.sig`
}

function makeAccessToken(expMs: number, accountId = 'acc-xyz'): string {
  return makeJwt({
    exp: Math.floor(expMs / 1000),
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })
}

function tokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    access_token: makeAccessToken(Date.now() + 60 * 60 * 1000),
    refresh_token: 'refresh-1',
    id_token: makeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc-xyz' } }),
    account_id: 'acc-xyz',
    expires_at: Date.now() + 60 * 60 * 1000,
    ...overrides,
  }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-provider-'))
  await saveCodexAuth(tmpDir, tokenSet())
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('patchCodexResponsesBody', () => {
  it('forces store:false and adds reasoning.encrypted_content', () => {
    const out = patchCodexResponsesBody({ model: 'gpt-5.1-codex', store: true, stream: true })
    expect(out.store).toBe(false)
    expect(out.include).toContain('reasoning.encrypted_content')
  })

  it('does not duplicate reasoning.encrypted_content when already present', () => {
    const out = patchCodexResponsesBody({ include: ['reasoning.encrypted_content'] })
    expect(out.include).toEqual(['reasoning.encrypted_content'])
  })

  it('is a no-op on non-objects', () => {
    expect(patchCodexResponsesBody(null)).toBeNull()
    expect(patchCodexResponsesBody('x')).toBe('x')
  })
})

describe('resolveCodexModel', () => {
  it('aliases gpt-5-codex to gpt-5.1-codex', () => {
    expect(resolveCodexModel('gpt-5-codex')).toBe('gpt-5.1-codex')
  })
  it('passes through unknown model names unchanged', () => {
    expect(resolveCodexModel('gpt-5.1')).toBe('gpt-5.1')
  })
})

describe('createCodexFetch', () => {
  it('injects all required Codex headers and rewrites the body', async () => {
    let captured: { headers: Headers; body: any } | undefined
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      captured = {
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const codexFetch = createCodexFetch({ dataDir: tmpDir, fetchImpl, version: '9.9.9' })
    await codexFetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.1-codex', stream: true, store: true }),
    })

    expect(captured).toBeDefined()
    const h = captured!.headers
    expect(h.get('authorization')).toBe(`Bearer ${(await currentAccessToken())}`)
    expect(h.get('chatgpt-account-id')).toBe('acc-xyz')
    expect(h.get('openai-beta')).toBe('responses=experimental')
    expect(h.get('originator')).toBe('codex_cli_rs')
    expect(h.get('version')).toBe('9.9.9')
    expect(h.get('accept')).toBe('text/event-stream')
    expect(h.get('session_id')).toMatch(/^[0-9a-f-]{36}$/)

    // body rewritten
    expect(captured!.body.store).toBe(false)
    expect(captured!.body.include).toContain('reasoning.encrypted_content')
  })

  it('uses a fresh session_id per request', async () => {
    const sessionIds: string[] = []
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      sessionIds.push(new Headers(init?.headers).get('session_id') ?? '')
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const codexFetch = createCodexFetch({ dataDir: tmpDir, fetchImpl })
    await codexFetch('https://chatgpt.com/backend-api/codex/responses', { method: 'POST', body: '{}' })
    await codexFetch('https://chatgpt.com/backend-api/codex/responses', { method: 'POST', body: '{}' })
    expect(sessionIds[0]).not.toBe(sessionIds[1])
    expect(sessionIds[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('refreshes the token once and retries on 401', async () => {
    // Make the stored access token already expired so getFreshAccessToken
    // refreshes first; the token endpoint then returns a rotated set.
    await saveCodexAuth(tmpDir, tokenSet({
      access_token: makeAccessToken(Date.now() - 60 * 1000), // expired
    }))

    const rotatedAccess = makeAccessToken(Date.now() + 60 * 60 * 1000)
    let tokenEndpointCalls = 0
    let responsesCalls = 0

    const fetchImpl: typeof globalThis.fetch = async (url, init) => {
      const target = String(url)
      if (target.includes('auth.openai.com/oauth/token')) {
        tokenEndpointCalls++
        return new Response(JSON.stringify({
          access_token: rotatedAccess,
          refresh_token: `refresh-rotated-${tokenEndpointCalls}`,
          id_token: makeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc-xyz' } }),
          expires_in: 3600,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      // Responses endpoint: first call 401, second (after refresh) 200.
      responsesCalls++
      const auth = new Headers(init?.headers).get('authorization')
      if (responsesCalls === 1) {
        return new Response('unauthorized', { status: 401 })
      }
      // second call must carry the freshly rotated token
      expect(auth).toBe(`Bearer ${rotatedAccess}`)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const codexFetch = createCodexFetch({ dataDir: tmpDir, fetchImpl })
    const res = await codexFetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: '{}',
    })

    expect(res.status).toBe(200)
    expect(responsesCalls).toBe(2)           // original + one retry
    // one refresh from getFreshAccessToken (expired) + one forced after 401
    expect(tokenEndpointCalls).toBe(2)
  })

  it('does not retry more than once on persistent 401', async () => {
    let responsesCalls = 0
    const fetchImpl: typeof globalThis.fetch = async (url) => {
      if (String(url).includes('auth.openai.com/oauth/token')) {
        return new Response(JSON.stringify({
          access_token: makeAccessToken(Date.now() + 60 * 60 * 1000),
          refresh_token: 'r2',
          id_token: makeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc-xyz' } }),
          expires_in: 3600,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      responsesCalls++
      return new Response('unauthorized', { status: 401 })
    }
    const codexFetch = createCodexFetch({ dataDir: tmpDir, fetchImpl })
    const res = await codexFetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      body: '{}',
    })
    expect(res.status).toBe(401)
    expect(responsesCalls).toBe(2) // original + exactly one retry, then give up
  })
})

/** Read back the access token that getFreshAccessToken would have returned. */
async function currentAccessToken(): Promise<string> {
  const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codex_auth.json'), 'utf-8'))
  return stored.tokens.access_token
}
