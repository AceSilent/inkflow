/**
 * Codex credential persistence.
 *
 * Credentials are written to `<dataDir>/.codex_auth.json` in a format that
 * mirrors the official Codex CLI `auth.json`:
 *
 *   {
 *     "OPENAI_API_KEY": null,
 *     "tokens": { id_token, access_token, refresh_token, account_id },
 *     "last_refresh": "<RFC3339>"
 *   }
 *
 * The file is written with 0600 permissions (owner read/write only). A
 * `getFreshAccessToken` helper transparently refreshes near-expiry tokens and
 * persists the rotated refresh token, with an in-process mutex so concurrent
 * callers never fire overlapping refreshes (which would burn the one-time
 * refresh token).
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  CodexAuthError,
  TokenSet,
  accessTokenExpiresSoon,
  extractAccountId,
  refreshTokens,
  type FetchImpl,
} from './codex-auth.js'

/** Filename under the data directory. */
export const CODEX_AUTH_FILENAME = '.codex_auth.json'

/** On-disk shape (auth.json compatible). */
export interface StoredAuth {
  OPENAI_API_KEY: string | null
  tokens: {
    id_token: string
    access_token: string
    refresh_token: string
    account_id?: string
  }
  /** RFC3339 timestamp of the last successful refresh / write. */
  last_refresh: string
}

function authPath(dataDir: string): string {
  return path.join(dataDir, CODEX_AUTH_FILENAME)
}

/** Build a TokenSet from on-disk StoredAuth (re-deriving expiry from JWTs). */
function storedToTokenSet(stored: StoredAuth): TokenSet {
  return {
    access_token: stored.tokens.access_token,
    refresh_token: stored.tokens.refresh_token,
    id_token: stored.tokens.id_token,
    account_id: stored.tokens.account_id ?? extractAccountId(stored.tokens.id_token || stored.tokens.access_token),
    // expires_at is recomputed from the access_token JWT inside
    // accessTokenExpiresSoon; we seed a conservative 0 so that, if the JWT
    // can't be decoded, the token is treated as already expired.
    expires_at: 0,
  }
}

/** Build the on-disk StoredAuth record from a TokenSet. */
function tokenSetToStored(tokenSet: TokenSet): StoredAuth {
  return {
    OPENAI_API_KEY: null,
    tokens: {
      id_token: tokenSet.id_token,
      access_token: tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      account_id: tokenSet.account_id,
    },
    last_refresh: new Date().toISOString(),
  }
}

/** Load stored credentials, or null when none exist / file is unreadable. */
export async function loadCodexAuth(dataDir: string): Promise<StoredAuth | null> {
  const file = authPath(dataDir)
  let text: string
  try {
    text = await fsp.readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CodexAuthError(`Codex auth file is corrupt (invalid JSON): ${file}`, { code: 'store_corrupt' })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexAuthError(`Codex auth file is corrupt (not an object): ${file}`, { code: 'store_corrupt' })
  }
  const obj = parsed as Partial<StoredAuth>
  if (!obj.tokens || typeof obj.tokens !== 'object') {
    throw new CodexAuthError(`Codex auth file is missing the tokens object: ${file}`, { code: 'store_corrupt' })
  }
  return {
    OPENAI_API_KEY: obj.OPENAI_API_KEY ?? null,
    tokens: {
      id_token: obj.tokens.id_token ?? '',
      access_token: obj.tokens.access_token ?? '',
      refresh_token: obj.tokens.refresh_token ?? '',
      account_id: obj.tokens.account_id,
    },
    last_refresh: obj.last_refresh ?? new Date(0).toISOString(),
  }
}

/** Persist a TokenSet, writing last_refresh and enforcing 0600 perms. */
export async function saveCodexAuth(dataDir: string, tokenSet: TokenSet): Promise<void> {
  await fsp.mkdir(dataDir, { recursive: true })
  const file = authPath(dataDir)
  const record = tokenSetToStored(tokenSet)
  const json = JSON.stringify(record, null, 2)
  // mode on open only applies when creating; chmod afterwards guarantees 0600
  // even if the file already existed with looser perms.
  await fsp.writeFile(file, json, { encoding: 'utf-8', mode: 0o600 })
  await fsp.chmod(file, 0o600).catch(() => {
    /* best-effort: some filesystems (e.g. certain mounts) reject chmod */
  })
}

/** Remove stored credentials. No-op if the file does not exist. */
export async function clearCodexAuth(dataDir: string): Promise<void> {
  const file = authPath(dataDir)
  try {
    await fsp.rm(file, { force: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}

/** Whether stored credentials currently exist (sync convenience check). */
export function hasCodexAuth(dataDir: string): boolean {
  return fs.existsSync(authPath(dataDir))
}

// ---------------------------------------------------------------------------
// Fresh access token, with concurrency-safe refresh.
// ---------------------------------------------------------------------------

/**
 * In-process refresh mutex, keyed by absolute auth-file path. While a refresh
 * for a given path is in flight, concurrent getFreshAccessToken callers await
 * the same promise instead of issuing their own refresh (a second refresh
 * would reuse — and thus invalidate — the rotating refresh token).
 */
const refreshLocks = new Map<string, Promise<{ accessToken: string; accountId: string }>>()

export interface GetFreshAccessTokenOptions {
  fetchImpl?: FetchImpl
  /** Override the expiry skew window (default 5 minutes). */
  skewMs?: number
}

export interface FreshAccessToken {
  accessToken: string
  accountId: string
}

/**
 * Return a usable access token + account id.
 *
 *   load from disk
 *     → if no credentials: throw a clear error
 *     → if access token is near expiry: refresh, persist the rotated tokens,
 *       and return the new access token
 *     → otherwise: return the stored token as-is
 *
 * Concurrent callers for the same data directory share a single refresh.
 */
export async function getFreshAccessToken(
  dataDir: string,
  { fetchImpl, skewMs }: GetFreshAccessTokenOptions = {}
): Promise<FreshAccessToken> {
  const key = path.resolve(authPath(dataDir))

  const inFlight = refreshLocks.get(key)
  if (inFlight) return inFlight

  const task = (async (): Promise<FreshAccessToken> => {
    const stored = await loadCodexAuth(dataDir)
    if (!stored) {
      throw new CodexAuthError(
        'No Codex credentials found. Sign in with ChatGPT first (run the Codex OAuth login).',
        { code: 'not_authenticated' }
      )
    }

    const tokenSet = storedToTokenSet(stored)

    if (!accessTokenExpiresSoon(tokenSet, skewMs)) {
      const accountId = tokenSet.account_id ?? ''
      if (!accountId) {
        throw new CodexAuthError('Stored Codex credentials are missing the account id.', {
          code: 'missing_account_id',
        })
      }
      return { accessToken: tokenSet.access_token, accountId }
    }

    // Near expiry → refresh and persist rotated tokens.
    const refreshed = await refreshTokens({ refresh_token: tokenSet.refresh_token, fetchImpl })
    await saveCodexAuth(dataDir, refreshed)
    const accountId = refreshed.account_id ?? stored.tokens.account_id ?? ''
    if (!accountId) {
      throw new CodexAuthError('Refreshed Codex credentials are missing the account id.', {
        code: 'missing_account_id',
      })
    }
    return { accessToken: refreshed.access_token, accountId }
  })()

  refreshLocks.set(key, task)
  try {
    return await task
  } finally {
    if (refreshLocks.get(key) === task) refreshLocks.delete(key)
  }
}
