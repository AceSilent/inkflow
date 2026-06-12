/**
 * Tests for the shared-credential reuse of the official Codex CLI auth.json.
 *
 * Covers:
 *   - source auto-discovery priority (InkFlow store > codex-cli > none)
 *   - readSharedCodexAuth field mapping + extra-field preservation
 *   - getFreshAccessToken in-place write-back (rotated tokens land back in the
 *     SAME source file, preserving auth_mode / OPENAI_API_KEY)
 *   - one-time backup of the shared CLI file before the first write-back
 *   - clearCodexAuth never deletes ~/.codex/auth.json
 *
 * CRITICAL: every test points CODEX_HOME at a temp dir. The real ~/.codex is
 * never read or written.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  loadCodexAuth,
  saveCodexAuth,
  clearCodexAuth,
  getFreshAccessToken,
  resolveAuthSource,
  readSharedCodexAuth,
  resolveCodexHome,
  codexCliAuthPath,
  CODEX_AUTH_FILENAME,
  CODEX_CLI_BACKUP_SUFFIX,
} from '@/llm/codex-store.js'
import type { TokenSet } from '@/llm/codex-auth.js'

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function b64url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  return `${header}.${b64url(JSON.stringify(payload))}.sig`
}

function makeAccessToken(expMs: number, accountId = 'acct_cli'): string {
  return makeJwt({
    exp: Math.floor(expMs / 1000),
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })
}

function makeIdToken(opts: { accountId?: string; planType?: string } = {}): string {
  const auth: Record<string, unknown> = {}
  if (opts.accountId !== undefined) auth['chatgpt_account_id'] = opts.accountId
  if (opts.planType !== undefined) auth['chatgpt_plan_type'] = opts.planType
  return makeJwt({ 'https://api.openai.com/auth': auth })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Write a fake official Codex CLI auth.json into the isolated CODEX_HOME.
 * Mirrors the real file: auth_mode + OPENAI_API_KEY (false) + tokens + last_refresh.
 */
async function writeFakeCliAuth(opts: {
  accessExpMs: number
  accountId?: string
  planType?: string
  refreshToken?: string
  apiKey?: string | false | null
  authMode?: string
} = { accessExpMs: Date.now() + 60 * 60 * 1000 }): Promise<string> {
  const file = codexCliAuthPath()
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const record = {
    auth_mode: opts.authMode ?? 'chatgpt',
    OPENAI_API_KEY: opts.apiKey ?? false,
    tokens: {
      id_token: makeIdToken({ accountId: opts.accountId ?? 'acct_cli', planType: opts.planType ?? 'prolite' }),
      access_token: makeAccessToken(opts.accessExpMs, opts.accountId ?? 'acct_cli'),
      refresh_token: opts.refreshToken ?? 'cli_refresh_1',
      account_id: opts.accountId ?? 'acct_cli',
    },
    last_refresh: new Date(Date.now() - 86_400_000).toISOString(),
  }
  await fsp.writeFile(file, JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 })
  return file
}

function inkflowTokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    access_token: makeAccessToken(Date.now() + 60 * 60 * 1000, 'acct_inkflow'),
    refresh_token: 'inkflow_refresh_1',
    id_token: makeIdToken({ accountId: 'acct_inkflow', planType: 'plus' }),
    account_id: 'acct_inkflow',
    expires_at: Date.now() + 60 * 60 * 1000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Harness — every test runs in isolated dataDir + CODEX_HOME temp dirs.
// ---------------------------------------------------------------------------

let dataDir: string
let codexHome: string
let savedCodexHome: string | undefined

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-shared-data-'))
  codexHome = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-shared-home-'))
  savedCodexHome = process.env.CODEX_HOME
  process.env.CODEX_HOME = codexHome
})

afterEach(async () => {
  if (savedCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = savedCodexHome
  await fsp.rm(dataDir, { recursive: true, force: true })
  await fsp.rm(codexHome, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe('resolveCodexHome / codexCliAuthPath', () => {
  it('honors CODEX_HOME', () => {
    expect(resolveCodexHome()).toBe(codexHome)
    expect(codexCliAuthPath()).toBe(path.join(codexHome, 'auth.json'))
  })

  it('falls back to ~/.codex when CODEX_HOME is unset', () => {
    delete process.env.CODEX_HOME
    expect(resolveCodexHome()).toBe(path.join(os.homedir(), '.codex'))
    process.env.CODEX_HOME = codexHome
  })
})

// ---------------------------------------------------------------------------
// readSharedCodexAuth
// ---------------------------------------------------------------------------

describe('readSharedCodexAuth', () => {
  it('returns null when no shared file exists', async () => {
    expect(await readSharedCodexAuth()).toBeNull()
  })

  it('maps tokens and preserves extra fields (auth_mode, OPENAI_API_KEY=false)', async () => {
    await writeFakeCliAuth({
      accessExpMs: Date.now() + 60 * 60 * 1000,
      accountId: 'acct_cli',
      refreshToken: 'cli_refresh_1',
    })
    const shared = await readSharedCodexAuth()
    expect(shared).not.toBeNull()
    expect(shared!.tokens.account_id).toBe('acct_cli')
    expect(shared!.tokens.refresh_token).toBe('cli_refresh_1')
    // OPENAI_API_KEY false must be preserved (not coerced to null).
    expect(shared!.OPENAI_API_KEY).toBe(false)
    // auth_mode is an extra field, preserved verbatim.
    expect(shared!.extra?.auth_mode).toBe('chatgpt')
  })

  it('throws store_corrupt on a malformed shared file', async () => {
    const file = codexCliAuthPath()
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, '{ not json', 'utf-8')
    await expect(readSharedCodexAuth()).rejects.toMatchObject({ code: 'store_corrupt' })
  })
})

// ---------------------------------------------------------------------------
// resolveAuthSource priority
// ---------------------------------------------------------------------------

describe('resolveAuthSource priority', () => {
  it('returns null when neither source exists', async () => {
    expect(await resolveAuthSource(dataDir)).toBeNull()
  })

  it('discovers the codex-cli source when only ~/.codex/auth.json exists', async () => {
    await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    const source = await resolveAuthSource(dataDir)
    expect(source?.kind).toBe('codex-cli')
    expect(source?.path).toBe(path.resolve(codexCliAuthPath()))
    expect(source?.raw.tokens.account_id).toBe('acct_cli')
  })

  it('prefers the InkFlow store over the codex-cli file when both exist', async () => {
    await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    await saveCodexAuth(dataDir, inkflowTokenSet())
    const source = await resolveAuthSource(dataDir)
    expect(source?.kind).toBe('inkflow')
    expect(source?.path).toBe(path.resolve(path.join(dataDir, CODEX_AUTH_FILENAME)))
    expect(source?.raw.tokens.account_id).toBe('acct_inkflow')
  })

  it('loadCodexAuth follows the same priority', async () => {
    await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    const fromCli = await loadCodexAuth(dataDir)
    expect(fromCli?.tokens.account_id).toBe('acct_cli')
  })
})

// ---------------------------------------------------------------------------
// getFreshAccessToken in-place write-back to the shared CLI file
// ---------------------------------------------------------------------------

describe('getFreshAccessToken (codex-cli source)', () => {
  it('returns the stored token without refresh when not near expiry', async () => {
    await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    let called = 0
    const fetchImpl = (async () => { called++; return jsonResponse({}) }) as unknown as typeof fetch
    const { accessToken, accountId } = await getFreshAccessToken(dataDir, { fetchImpl })
    expect(accountId).toBe('acct_cli')
    expect(accessToken).toContain('.')
    expect(called).toBe(0)
  })

  it('refreshes near-expiry tokens and writes them back to ~/.codex/auth.json, preserving auth_mode', async () => {
    const cliPath = await writeFakeCliAuth({
      accessExpMs: Date.now() + 60 * 1000, // inside the 5-minute skew window
      accountId: 'acct_cli',
      refreshToken: 'cli_refresh_old',
      authMode: 'chatgpt',
      apiKey: false,
    })

    const newAccess = makeAccessToken(Date.now() + 60 * 60 * 1000, 'acct_cli')
    let capturedRefresh = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedRefresh = new URLSearchParams(String(init.body)).get('refresh_token') ?? ''
      return jsonResponse({
        id_token: makeIdToken({ accountId: 'acct_cli', planType: 'prolite' }),
        access_token: newAccess,
        refresh_token: 'cli_refresh_rotated',
        expires_in: 3600,
      })
    }) as unknown as typeof fetch

    const { accessToken, accountId } = await getFreshAccessToken(dataDir, { fetchImpl })
    expect(capturedRefresh).toBe('cli_refresh_old')
    expect(accessToken).toBe(newAccess)
    expect(accountId).toBe('acct_cli')

    // The rotated tokens were written back to the SAME shared file...
    const written = JSON.parse(fs.readFileSync(cliPath, 'utf-8'))
    expect(written.tokens.access_token).toBe(newAccess)
    expect(written.tokens.refresh_token).toBe('cli_refresh_rotated')
    // ...with the original CLI-owned fields preserved.
    expect(written.auth_mode).toBe('chatgpt')
    expect(written.OPENAI_API_KEY).toBe(false)
    // last_refresh was bumped.
    expect(typeof written.last_refresh).toBe('string')

    // No InkFlow-private store was created.
    expect(fs.existsSync(path.join(dataDir, CODEX_AUTH_FILENAME))).toBe(false)
  })

  it('takes a one-time backup of the shared file before the first write-back', async () => {
    const cliPath = await writeFakeCliAuth({
      accessExpMs: Date.now() + 60 * 1000,
      accountId: 'acct_cli',
      refreshToken: 'cli_refresh_old',
    })
    const originalBytes = fs.readFileSync(cliPath, 'utf-8')

    const fetchImpl = (async () => jsonResponse({
      id_token: makeIdToken({ accountId: 'acct_cli' }),
      access_token: makeAccessToken(Date.now() + 60 * 60 * 1000, 'acct_cli'),
      refresh_token: 'cli_refresh_rotated',
      expires_in: 3600,
    })) as unknown as typeof fetch

    await getFreshAccessToken(dataDir, { fetchImpl })

    const backup = `${cliPath}${CODEX_CLI_BACKUP_SUFFIX}`
    expect(fs.existsSync(backup)).toBe(true)
    // Backup holds the ORIGINAL (pre-rotation) contents.
    expect(fs.readFileSync(backup, 'utf-8')).toBe(originalBytes)
  })

  it('coalesces concurrent refreshes into one network call (codex-cli source)', async () => {
    await writeFakeCliAuth({
      accessExpMs: Date.now() + 60 * 1000,
      accountId: 'acct_cli',
      refreshToken: 'cli_refresh_old',
    })
    let calls = 0
    const newAccess = makeAccessToken(Date.now() + 60 * 60 * 1000, 'acct_cli')
    const fetchImpl = (async () => {
      calls++
      await new Promise((r) => setTimeout(r, 20))
      return jsonResponse({
        id_token: makeIdToken({ accountId: 'acct_cli' }),
        access_token: newAccess,
        refresh_token: 'cli_refresh_rotated',
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
})

// ---------------------------------------------------------------------------
// clearCodexAuth must never delete the shared CLI file
// ---------------------------------------------------------------------------

describe('clearCodexAuth safety', () => {
  it('deletes the InkFlow store but never the shared ~/.codex/auth.json', async () => {
    const cliPath = await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    await saveCodexAuth(dataDir, inkflowTokenSet())
    expect(fs.existsSync(path.join(dataDir, CODEX_AUTH_FILENAME))).toBe(true)

    await clearCodexAuth(dataDir)

    // InkFlow store gone...
    expect(fs.existsSync(path.join(dataDir, CODEX_AUTH_FILENAME))).toBe(false)
    // ...shared CLI file untouched.
    expect(fs.existsSync(cliPath)).toBe(true)

    // After clearing, the resolver falls back to the (still-present) CLI file.
    const source = await resolveAuthSource(dataDir)
    expect(source?.kind).toBe('codex-cli')
  })

  it('is a no-op (does not touch the shared file) when only the CLI source exists', async () => {
    const cliPath = await writeFakeCliAuth({ accessExpMs: Date.now() + 60 * 60 * 1000, accountId: 'acct_cli' })
    await clearCodexAuth(dataDir)
    expect(fs.existsSync(cliPath)).toBe(true)
  })
})
