/**
 * Codex credential persistence + automatic reuse of the official Codex CLI
 * credentials.
 *
 * Two credential sources are understood, in priority order:
 *
 *   1. **InkFlow store** — `<dataDir>/.codex_auth.json`. Written when the user
 *      explicitly signs in through InkFlow's loopback OAuth flow.
 *   2. **Codex CLI store** — `<CODEX_HOME>/auth.json` (CODEX_HOME defaults to
 *      `~/.codex`). The official file the `codex` CLI / opencode-style tools
 *      write. Reused transparently so a user who already ran `codex login`
 *      gets zero-login access.
 *
 * Both files share the official auth.json shape:
 *
 *   {
 *     "auth_mode": "chatgpt",          // present in the CLI file; preserved
 *     "OPENAI_API_KEY": null | false | "sk-…",
 *     "tokens": { id_token, access_token, refresh_token, account_id },
 *     "last_refresh": "<RFC3339>"
 *   }
 *
 * Files are written with 0600 permissions (owner read/write only) via an atomic
 * temp-file + rename. `getFreshAccessToken` transparently refreshes near-expiry
 * tokens and writes the rotated tokens back to **the same source file** so the
 * InkFlow and `codex` CLI views stay in sync. When the source is the shared
 * `~/.codex/auth.json`, every original field (auth_mode, OPENAI_API_KEY, …) is
 * preserved and a one-time backup (`auth.json.inkflow-bak`) is taken before the
 * first write-back.
 *
 * Concurrency: an in-process mutex keyed by the resolved source path prevents
 * overlapping refreshes (which would burn the one-time rotating refresh token).
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  CodexAuthError,
  TokenSet,
  accessTokenExpiresSoon,
  extractAccountId,
  refreshTokens,
  type FetchImpl,
} from './codex-auth.js'

/** Filename of the InkFlow-private store under the data directory. */
export const CODEX_AUTH_FILENAME = '.codex_auth.json'

/** Suffix of the one-time backup taken before the first write-back to the CLI file. */
export const CODEX_CLI_BACKUP_SUFFIX = '.inkflow-bak'

/**
 * On-disk shape (auth.json compatible). Any additional keys present in the
 * source file (e.g. `auth_mode`) are carried verbatim in `extra` so a write-back
 * to the shared CLI file never drops fields the CLI relies on.
 */
export interface StoredAuth {
  OPENAI_API_KEY: string | null | false
  tokens: {
    id_token: string
    access_token: string
    refresh_token: string
    account_id?: string
  }
  /** RFC3339 timestamp of the last successful refresh / write. */
  last_refresh: string
  /** Original top-level fields other than the ones above (preserved on write-back). */
  extra?: Record<string, unknown>
}

/** Which credential file a resolved login came from. */
export type CodexAuthSourceKind = 'inkflow' | 'codex-cli'

export interface ResolvedAuthSource {
  /** Absolute path to the credential file in use. */
  path: string
  /** Whether it is InkFlow's private store or the shared Codex CLI file. */
  kind: CodexAuthSourceKind
  /** The parsed credentials (with any extra fields preserved). */
  raw: StoredAuth
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** Resolve the Codex home directory (CODEX_HOME overrides the default ~/.codex). */
export function resolveCodexHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(os.homedir(), '.codex')
}

/** Absolute path to the official Codex CLI credential file. */
export function codexCliAuthPath(): string {
  return path.join(resolveCodexHome(), 'auth.json')
}

/** Absolute path to the InkFlow-private credential store. */
function inkflowAuthPath(dataDir: string): string {
  return path.join(dataDir, CODEX_AUTH_FILENAME)
}

// ---------------------------------------------------------------------------
// Parsing / mapping
// ---------------------------------------------------------------------------

/** The top-level keys we manage explicitly; everything else is preserved in `extra`. */
const KNOWN_TOP_LEVEL_KEYS = new Set(['OPENAI_API_KEY', 'tokens', 'last_refresh'])

/** Parse raw auth.json text into a StoredAuth, preserving unknown top-level fields. */
function parseStoredAuth(text: string, file: string): StoredAuth {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CodexAuthError(`Codex auth file is corrupt (invalid JSON): ${file}`, { code: 'store_corrupt' })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexAuthError(`Codex auth file is corrupt (not an object): ${file}`, { code: 'store_corrupt' })
  }
  const obj = parsed as Record<string, unknown>
  const tokensRaw = obj.tokens
  if (!tokensRaw || typeof tokensRaw !== 'object') {
    throw new CodexAuthError(`Codex auth file is missing the tokens object: ${file}`, { code: 'store_corrupt' })
  }
  const tokens = tokensRaw as Record<string, unknown>

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) extra[key] = value
  }

  const apiKey = obj.OPENAI_API_KEY
  return {
    OPENAI_API_KEY:
      typeof apiKey === 'string' || apiKey === false ? apiKey : (apiKey == null ? null : null),
    tokens: {
      id_token: typeof tokens.id_token === 'string' ? tokens.id_token : '',
      access_token: typeof tokens.access_token === 'string' ? tokens.access_token : '',
      refresh_token: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : '',
      account_id: typeof tokens.account_id === 'string' ? tokens.account_id : undefined,
    },
    last_refresh: typeof obj.last_refresh === 'string' ? obj.last_refresh : new Date(0).toISOString(),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  }
}

/** Read + parse an auth.json file, or null when it does not exist. */
async function readStoredAuthFile(file: string): Promise<StoredAuth | null> {
  let text: string
  try {
    text = await fsp.readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return parseStoredAuth(text, file)
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

/**
 * Merge a refreshed TokenSet into an existing StoredAuth, preserving all
 * original fields (auth_mode, OPENAI_API_KEY, any extras) and only updating the
 * tokens + last_refresh. Used for in-place write-back to the source file.
 */
function mergeRefreshedAuth(prev: StoredAuth, tokenSet: TokenSet): StoredAuth {
  return {
    OPENAI_API_KEY: prev.OPENAI_API_KEY ?? null,
    tokens: {
      id_token: tokenSet.id_token || prev.tokens.id_token,
      access_token: tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      account_id: tokenSet.account_id ?? prev.tokens.account_id,
    },
    last_refresh: new Date().toISOString(),
    ...(prev.extra && Object.keys(prev.extra).length > 0 ? { extra: prev.extra } : {}),
  }
}

/** Build the on-disk StoredAuth record from a TokenSet (fresh InkFlow store write). */
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

/** Serialize a StoredAuth back to its on-disk JSON, flattening `extra`. */
function serializeStoredAuth(stored: StoredAuth): string {
  const out: Record<string, unknown> = { ...(stored.extra ?? {}) }
  out.OPENAI_API_KEY = stored.OPENAI_API_KEY ?? null
  out.tokens = {
    id_token: stored.tokens.id_token,
    access_token: stored.tokens.access_token,
    refresh_token: stored.tokens.refresh_token,
    ...(stored.tokens.account_id ? { account_id: stored.tokens.account_id } : {}),
  }
  out.last_refresh = stored.last_refresh
  return JSON.stringify(out, null, 2)
}

/** Atomically write JSON to `file` (temp file + rename) with 0600 perms. */
async function atomicWrite0600(file: string, json: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  await fsp.writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 })
  await fsp.chmod(tmp, 0o600).catch(() => {
    /* best-effort: some filesystems (e.g. certain mounts) reject chmod */
  })
  try {
    await fsp.rename(tmp, file)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
  // rename preserves the temp file's mode; re-assert 0600 in case the target
  // pre-existed with looser perms on a filesystem where rename keeps them.
  await fsp.chmod(file, 0o600).catch(() => {})
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Resolve which credential source is active, reading and parsing it.
 *
 *   InkFlow store present → use it (explicit InkFlow login wins).
 *   else Codex CLI auth.json present → use it (zero-login reuse).
 *   else → null (no credentials anywhere).
 *
 * A corrupt file on the chosen source surfaces as a CodexAuthError
 * (code 'store_corrupt'); a missing file simply falls through.
 */
export async function resolveAuthSource(dataDir: string): Promise<ResolvedAuthSource | null> {
  const inkflowPath = inkflowAuthPath(dataDir)
  const inkflow = await readStoredAuthFile(inkflowPath)
  if (inkflow) {
    return { path: path.resolve(inkflowPath), kind: 'inkflow', raw: inkflow }
  }

  const cliPath = codexCliAuthPath()
  const cli = await readStoredAuthFile(cliPath)
  if (cli) {
    return { path: path.resolve(cliPath), kind: 'codex-cli', raw: cli }
  }

  return null
}

/**
 * Read + parse the official Codex CLI auth.json (`<CODEX_HOME>/auth.json`).
 * Returns null when the file does not exist; throws CodexAuthError
 * (code 'store_corrupt') on a malformed file. Extra fields (auth_mode,
 * OPENAI_API_KEY) are preserved in the returned record's `extra`.
 */
export async function readSharedCodexAuth(): Promise<StoredAuth | null> {
  return readStoredAuthFile(codexCliAuthPath())
}

// ---------------------------------------------------------------------------
// Public load / save / clear (InkFlow-private store).
// ---------------------------------------------------------------------------

/**
 * Load stored credentials following the source-resolution priority
 * (InkFlow store, then the shared Codex CLI file). Returns null when neither
 * exists. Kept for backward compatibility with existing callers that only need
 * the parsed record.
 */
export async function loadCodexAuth(dataDir: string): Promise<StoredAuth | null> {
  const source = await resolveAuthSource(dataDir)
  return source?.raw ?? null
}

/**
 * Persist a TokenSet to the **InkFlow-private** store (`<dataDir>/.codex_auth.json`).
 * Used by the loopback login path. Enforces 0600 perms via atomic write.
 */
export async function saveCodexAuth(dataDir: string, tokenSet: TokenSet): Promise<void> {
  const file = inkflowAuthPath(dataDir)
  await atomicWrite0600(file, serializeStoredAuth(tokenSetToStored(tokenSet)))
}

/**
 * Remove the **InkFlow-private** store only. Never touches the shared
 * `~/.codex/auth.json` — deleting that would break the user's `codex` CLI
 * login. No-op if the InkFlow file does not exist.
 */
export async function clearCodexAuth(dataDir: string): Promise<void> {
  const file = inkflowAuthPath(dataDir)
  try {
    await fsp.rm(file, { force: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}

/** Whether InkFlow-private credentials currently exist (sync convenience check). */
export function hasCodexAuth(dataDir: string): boolean {
  return fs.existsSync(inkflowAuthPath(dataDir))
}

// ---------------------------------------------------------------------------
// Fresh access token, with concurrency-safe in-place refresh.
// ---------------------------------------------------------------------------

/**
 * In-process refresh mutex, keyed by the resolved source file path. While a
 * refresh for a given path is in flight, concurrent getFreshAccessToken callers
 * await the same promise instead of issuing their own refresh (a second refresh
 * would reuse — and thus invalidate — the rotating refresh token).
 */
const refreshLocks = new Map<string, Promise<FreshAccessToken>>()

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
 * Take a one-time backup of the shared CLI auth.json before InkFlow's first
 * write-back, so a refresh failure can never leave the user without a way to
 * restore the file the `codex` CLI depends on. No-op if the backup already
 * exists. Best-effort: a backup failure does not block the refresh.
 */
async function backupCliAuthOnce(cliPath: string): Promise<void> {
  const backup = `${cliPath}${CODEX_CLI_BACKUP_SUFFIX}`
  try {
    await fsp.access(backup)
    return // backup already exists — only back up once
  } catch {
    /* no backup yet */
  }
  try {
    await fsp.copyFile(cliPath, backup)
    await fsp.chmod(backup, 0o600).catch(() => {})
  } catch {
    /* best-effort backup */
  }
}

/**
 * Write a refreshed StoredAuth back to its source file, in place.
 *   - InkFlow store: straightforward atomic write.
 *   - Codex CLI file: take a one-time backup first, then atomically write,
 *     preserving every original field (auth_mode, OPENAI_API_KEY, extras).
 */
async function writeBackRefreshed(source: ResolvedAuthSource, tokenSet: TokenSet): Promise<void> {
  const merged = mergeRefreshedAuth(source.raw, tokenSet)
  if (source.kind === 'codex-cli') {
    await backupCliAuthOnce(source.path)
  }
  await atomicWrite0600(source.path, serializeStoredAuth(merged))
}

/**
 * Resolve the active source and write a refreshed TokenSet back to it in place
 * (preserving CLI fields and taking a one-time backup of the shared file).
 * Returns the resolved account id, or undefined when there is no usable source.
 * Used by the provider's forced-refresh-on-401 path so the rotated tokens land
 * in the same file getFreshAccessToken reads from. Concurrency-safe via the
 * same per-source mutex.
 */
export async function writeBackRefreshedAuth(
  dataDir: string,
  tokenSet: TokenSet
): Promise<{ accountId: string } | undefined> {
  const source = await resolveAuthSource(dataDir)
  if (!source) return undefined
  await writeBackRefreshed(source, tokenSet)
  const accountId = tokenSet.account_id ?? source.raw.tokens.account_id ?? ''
  if (!accountId) return undefined
  return { accountId }
}

/**
 * Return a usable access token + account id.
 *
 *   resolve source (InkFlow store, else shared ~/.codex/auth.json)
 *     → if no credentials: throw a clear 'not_authenticated' error
 *     → if access token is near expiry: refresh, write rotated tokens back to
 *       the SAME source file (preserving CLI fields), and return the new token
 *     → otherwise: return the stored token as-is
 *
 * Concurrent callers for the same source file share a single refresh.
 */
export async function getFreshAccessToken(
  dataDir: string,
  { fetchImpl, skewMs }: GetFreshAccessTokenOptions = {}
): Promise<FreshAccessToken> {
  const source = await resolveAuthSource(dataDir)
  if (!source) {
    throw new CodexAuthError(
      'No Codex credentials found. Sign in with ChatGPT first (run the Codex OAuth login, or `codex login`).',
      { code: 'not_authenticated' }
    )
  }

  const key = source.path
  const inFlight = refreshLocks.get(key)
  if (inFlight) return inFlight

  const task = (async (): Promise<FreshAccessToken> => {
    const tokenSet = storedToTokenSet(source.raw)

    if (!accessTokenExpiresSoon(tokenSet, skewMs)) {
      const accountId = tokenSet.account_id ?? ''
      if (!accountId) {
        throw new CodexAuthError('Stored Codex credentials are missing the account id.', {
          code: 'missing_account_id',
        })
      }
      return { accessToken: tokenSet.access_token, accountId }
    }

    // Near expiry → refresh and write the rotated tokens back to the source.
    const refreshed = await refreshTokens({ refresh_token: tokenSet.refresh_token, fetchImpl })
    await writeBackRefreshed(source, refreshed)
    const accountId = refreshed.account_id ?? source.raw.tokens.account_id ?? ''
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
